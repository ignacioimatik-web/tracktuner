/**
 * TrackTuner — pipeline de procesado.
 * Orquesta: análisis → cadena de mastering paso a paso → render offline.
 *
 * v2: cada fixer se aplica por separado en una cadena secuencial; después de cada
 * paso se vuelve a analizar el audio para medir el ANTES→DESPUÉS real de esa
 * mejora. El render offline reporta progreso en tiempo real (truco suspend/resume).
 */

import { analyzeAudio } from "./analysis";
import type { AnalysisProgress, AnalysisResult, ChainProgress, Fixer, FixerRunResult, MasterResult } from "./types";
import { createFixer } from "./fixers";

/** LUFS objetivo de streaming (coincide con DEFAULT_PRESET.targetLufs). */
export const TARGET_LUFS = -14;

/** Mezcla un AudioBuffer estéreo/multicanal a mono (Float32Array). */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / ch;
  }
  return out;
}

/** Analiza un AudioBuffer completo (con progreso opcional por fases). */
export function analyzeBuffer(buffer: AudioBuffer, onProgress?: (p: AnalysisProgress) => void): AnalysisResult {
  return analyzeAudio(mixToMono(buffer), buffer.sampleRate, { onProgress });
}

/**
 * Render offline de un grafo con progreso real.
 * El truco: se programan suspends en tiempos regulares; cada vez que el contexto
 * se suspende leemos currentTime/duration → porcentaje → reanudamos.
 * Para pistas cortas (dur < 0.5s) no hay checkpoints: el progreso salta a 100%.
 */
async function renderGraph(
  buffer: AudioBuffer,
  fixers: Fixer[],
  onProgress: (pct: number) => void,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  let node: AudioNode = src;
  for (const f of fixers) {
    if (!f.enabled) continue;
    node = f.apply(ctx, node);
  }
  node.connect(ctx.destination);
  src.start(0);

  const duration = buffer.duration;
  const checkpoints = duration > 0.5 ? Math.max(4, Math.min(60, Math.round(duration))) : 0;
  for (let i = 1; i <= checkpoints; i++) {
    void ctx.suspend((duration * i) / (checkpoints + 1));
  }

  let last = 0;
  ctx.onstatechange = () => {
    if (ctx.state === "suspended" && duration > 0) {
      const pct = Math.min(0.98, ctx.currentTime / duration);
      if (pct > last) {
        last = pct;
        onProgress(pct);
      }
      void ctx.resume();
    }
  };

  const rendered = await ctx.startRendering();
  onProgress(1);
  return rendered;
}

export interface MasterCallbacks {
  /** evento por paso de la cadena (parciales, mergear por índice) */
  onChain?: (stepIndex: number, run: Partial<FixerRunResult>) => void;
  /** progreso global de la cadena */
  onProgress?: (p: ChainProgress) => void;
}

/**
 * Ejecuta la cadena de mastering paso a paso: para cada fixer habilitado,
 * renderiza el prefijo de la cadena, mide antes/después y entrega el buffer final.
 */
export async function masterTrack(
  buffer: AudioBuffer,
  fixers: Fixer[],
  cb: MasterCallbacks = {},
): Promise<MasterResult> {
  const started = performance.now();
  const enabled = fixers.filter((f) => f.enabled);
  const total = enabled.length;
  const chain: FixerRunResult[] = [];

  // Si no hay fixers habilitados, devolvemos el original tal cual.
  if (total === 0) {
    const analysis = analyzeBuffer(buffer);
    cb.onProgress?.({ overall: 1, stepIndex: 0, stepTotal: 0 });
    return { buffer, analysis, chain, elapsedMs: performance.now() - started };
  }

  const initial = analyzeBuffer(buffer);
  let current = buffer;
  let before = initial;

  for (let i = 0; i < total; i++) {
    // Normalización exacta: el paso de gain calcula la ganancia que deja el
    // audio a TARGET_LUFS medido de verdad (no un ajuste fijo del diagnóstico).
    let f = enabled[i];
    if (f.id === "gain" && isFinite(before.integratedLufs)) {
      const db = TARGET_LUFS - before.integratedLufs;
      f = createFixer("gain", { db: Math.round(db * 100) / 100 }, f.amount, true);
    }
    const stepStart = performance.now();
    const run: FixerRunResult = {
      fixerId: f.id,
      status: "rendering",
      progress: 0,
      before,
      after: before,
      metricBefore: f.meta.getMetric(before),
      metricAfter: f.meta.getMetric(before),
      durationMs: 0,
    };
    chain.push(run);
    cb.onChain?.(i, { status: "rendering", progress: 0 });
    cb.onProgress?.({ overall: i / total, stepIndex: i, stepTotal: total });

    try {
      // 1) render del prefijo de cadena con progreso en tiempo real.
      //    Importante: usar la lista con el fixer recalculado (p.ej. gain exacto).
      const chainFixers = enabled.map((x, j) => (j === i ? f : x));
      const rendered = await renderGraph(current, chainFixers.slice(0, i + 1), (pct) => {
        run.progress = pct;
        cb.onChain?.(i, { progress: pct });
      });

      // 2) medición real del después
      run.status = "measuring";
      run.progress = 0.99;
      cb.onChain?.(i, { status: "measuring" });

      const after = analyzeBuffer(rendered);
      const mv = f.meta.getMetric(before);
      const ma = f.meta.getMetric(after);

      run.before = before;
      run.after = after;
      run.metricBefore = mv;
      run.metricAfter = ma;
      run.durationMs = performance.now() - stepStart;
      run.status = "done";
      run.progress = 1;

      current = rendered;
      before = after;

      cb.onChain?.(i, { status: "done", progress: 1, metricBefore: mv, metricAfter: ma, before, after });
      cb.onProgress?.({ overall: (i + 1) / total, stepIndex: i, stepTotal: total });
    } catch (e) {
      run.status = "error";
      run.error = e instanceof Error ? e.message : String(e);
      cb.onChain?.(i, { status: "error", error: run.error });
      cb.onProgress?.({ overall: (i + 1) / total, stepIndex: i, stepTotal: total });
      break; // cadena truncada: entregamos lo procesado hasta ahora
    }
  }

  return { buffer: current, analysis: before, chain, elapsedMs: performance.now() - started };
}
