"use client";

/**
 * TrackTuner — hook de estado del procesador.
 * Orquesta: carga/decodificación → análisis con progreso → cadena de fixers editable
 * → mastering paso a paso con telemetría real → descarga WAV/MP3.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisProgress,
  AnalysisResult,
  ChainProgress,
  ConsoleLevel,
  ConsoleMessage,
  Fixer,
  FixerRunResult,
} from "../lib/audio/types";
import { exportMp3, exportWav } from "../lib/audio/export";
import { analyzeBuffer, masterTrack } from "../lib/audio/pipeline";
import { DEFAULT_PRESET, FIXER_META, FIXER_ORDER, neutralFixer, rebuildFixer, suggestedFixers } from "../lib/audio/fixers";

export interface TrackState {
  fileName: string;
  audioBuffer: AudioBuffer;
  analysis: AnalysisResult;
  fixers: Fixer[];
  fixedBuffer: AudioBuffer | null;
  fixedAnalysis: AnalysisResult | null;
  chain: FixerRunResult[];
  elapsedMs: number | null;
}

let consoleSeq = 0;
const stamp = () =>
  new Date().toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

const fmtMetric = (label: string, before: number, after: number) => {
  const arrow = after < before ? "↓" : after > before ? "↑" : "→";
  return `${label}: ${before.toFixed(1)} → ${after.toFixed(1)} ${arrow}`;
};

export function useTrackProcessor() {
  const [state, setState] = useState<TrackState | null>(null);
  const [processing, setProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [mastering, setMastering] = useState(false);
  const [chainProgress, setChainProgress] = useState<ChainProgress | null>(null);
  const [mp3Progress, setMp3Progress] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const push = useCallback((level: ConsoleLevel, text: string) => {
    setMessages((prev) => [...prev.slice(-199), { id: consoleSeq++, time: stamp(), level, text }]);
  }, []);

  /** Carga y decodifica el archivo, analiza con progreso y propone la cadena de fixers. */
  const loadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) {
        setError("Por favor sube un archivo de audio (MP3, WAV, M4A, OGG).");
        return;
      }
      setError(null);
      setProcessing(true);
      setAnalyzing(true);
      setAnalysisProgress({ phase: "Decodificando audio…", pct: 0 });
      push("info", `📂 Cargando ${file.name}`);
      try {
        const buf = await file.arrayBuffer();
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        ctx.close();
        setAnalysisProgress({ phase: "Analizando pista…", pct: 0.05 });

        const analysis = analyzeBuffer(decoded, (p) => setAnalysisProgress(p));
        const fixers = suggestedFixers(analysis.issues, DEFAULT_PRESET);

        push("ok", `✅ Pista decodificada: ${(decoded.duration / 60).toFixed(1)} min @ ${decoded.sampleRate} Hz`);
        push(
          "info",
          `📊 ${analysis.integratedLufs.toFixed(1)} LUFS · ${analysis.truePeakDbtp.toFixed(1)} dBTP · ${analysis.issues.length} problema(s)`,
        );
        for (const iss of analysis.issues) push(iss.severity > 0.6 ? "warn" : "info", `  • ${iss.label}`);

        setState({
          fileName: file.name,
          audioBuffer: decoded,
          analysis,
          fixers,
          fixedBuffer: null,
          fixedAnalysis: null,
          chain: [],
          elapsedMs: null,
        });
        setDirty(false);
      } catch (e) {
        setError(`No se pudo decodificar el audio: ${e instanceof Error ? e.message : String(e)}`);
        push("error", `❌ Decodificación fallida: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setAnalyzing(false);
        setProcessing(false);
        setAnalysisProgress(null);
      }
    },
    [push],
  );

  /** Ejecuta la cadena de mastering paso a paso, con telemetría en vivo por fixer. */
  const master = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.fixers.length === 0) return;
    const enabledCount = s.fixers.filter((f) => f.enabled).length;
    setMastering(true);
    setError(null);
    setDirty(false);
    setChainProgress({ overall: 0, stepIndex: 0, stepTotal: enabledCount });
    push("step", `🚀 Iniciando cadena de mastering (${enabledCount} pasos)…`);
    setState((st) => (st ? { ...st, chain: [], fixedBuffer: null, fixedAnalysis: null, elapsedMs: null } : st));
    try {
      const result = await masterTrack(s.audioBuffer, s.fixers, {
        onChain: (idx, run) => {
          setState((st) => {
            if (!st) return st;
            const chain = [...st.chain];
            while (chain.length <= idx) chain.push(undefined as unknown as FixerRunResult);
            chain[idx] = { ...(chain[idx] ?? ({} as FixerRunResult)), ...run } as FixerRunResult;
            return { ...st, chain };
          });
        },
        onProgress: (p) => setChainProgress(p),
      });

      for (const r of result.chain) {
        const meta = FIXER_META[r.fixerId];
        if (!meta) continue;
        if (r.status === "done") {
          push("ok", `${meta.icon} ${meta.label}: ${fmtMetric(meta.metricLabel, r.metricBefore, r.metricAfter)}`);
        } else if (r.status === "error") {
          push("error", `❌ ${meta.label}: ${r.error ?? "fallo desconocido"}`);
        }
      }
      push(
        "ok",
        `⏱️ Mastering completado en ${(result.elapsedMs / 1000).toFixed(1)}s · ${result.analysis.integratedLufs.toFixed(1)} LUFS · ${result.analysis.truePeakDbtp.toFixed(1)} dBTP`,
      );
      setState((st) =>
        st
          ? { ...st, fixedBuffer: result.buffer, fixedAnalysis: result.analysis, chain: result.chain, elapsedMs: result.elapsedMs }
          : st,
      );
    } catch (e) {
      setError(`Error procesando la pista: ${e instanceof Error ? e.message : String(e)}`);
      push("error", `❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMastering(false);
      setChainProgress(null);
    }
  }, [push]);

  /** Ajusta intensidad o activación de un fixer (invalida el resultado previo). */
  const updateFixer = useCallback(
    (id: string, patch: { amount?: number; enabled?: boolean }) => {
      const s = stateRef.current;
      if (!s) return;
      const f = s.fixers.find((x) => x.id === id);
      if (!f) return;
      const nf = rebuildFixer(f, patch.amount ?? f.amount, patch.enabled ?? f.enabled);
      const fixers = s.fixers.map((x) => (x.id === id ? nf : x));
      const label = FIXER_META[id]?.label ?? id;
      if (patch.enabled === false) push("info", `⏸️ ${label}: desactivado`);
      else if (patch.enabled === true) push("info", `▶️ ${label}: activado`);
      else push("info", `⚙️ ${label}: intensidad ${Math.round((patch.amount ?? f.amount) * 100)}%`);
      setState({ ...s, fixers, fixedBuffer: null, fixedAnalysis: null, chain: [], elapsedMs: null });
      setDirty(true);
    },
    [push],
  );

  /** Añade una mejora manual opcional a la cadena. */
  const addFixer = useCallback(
    (id: string) => {
      const s = stateRef.current;
      if (!s) return;
      if (s.fixers.some((f) => f.id === id)) return;
      const fixers = [...s.fixers, neutralFixer(id)].sort(
        (a, b) => FIXER_ORDER.indexOf(a.id) - FIXER_ORDER.indexOf(b.id),
      );
      push("info", `➕ ${FIXER_META[id]?.label ?? id} añadido a la cadena`);
      setState({ ...s, fixers, fixedBuffer: null, fixedAnalysis: null, chain: [], elapsedMs: null });
      setDirty(true);
    },
    [push],
  );

  /** Quita una mejora de la cadena. */
  const removeFixer = useCallback(
    (id: string) => {
      const s = stateRef.current;
      if (!s) return;
      const fixers = s.fixers.filter((f) => f.id !== id);
      push("info", `🗑️ ${FIXER_META[id]?.label ?? id} eliminado de la cadena`);
      setState({ ...s, fixers, fixedBuffer: null, fixedAnalysis: null, chain: [], elapsedMs: null });
      setDirty(true);
    },
    [push],
  );

  /** Descarga el master como WAV (pérdida) o MP3 320k (con progreso). */
  const download = useCallback(
    async (kind: "wav" | "mp3") => {
      const s = stateRef.current;
      if (!s?.fixedBuffer) return;
      const base = s.fileName.replace(/\.[^.]+$/, "");
      if (kind === "wav") {
        exportWav(s.fixedBuffer, `${base}-fixed.wav`);
        push("ok", `⬇️ WAV exportado: ${base}-fixed.wav`);
      } else {
        setProcessing(true);
        setMp3Progress(0);
        try {
          await exportMp3(s.fixedBuffer, `${base}-fixed.mp3`, (p) => setMp3Progress(p));
          push("ok", `⬇️ MP3 320k exportado: ${base}-fixed.mp3`);
        } catch (e) {
          push("error", `❌ Export MP3: ${e instanceof Error ? e.message : String(e)}`);
          setError(`Error exportando MP3: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setProcessing(false);
          setMp3Progress(null);
        }
      }
    },
    [push],
  );

  const reset = useCallback(() => {
    setState(null);
    setError(null);
    setDirty(false);
    setMastering(false);
    setChainProgress(null);
    setMp3Progress(null);
    setProcessing(false);
    setAnalyzing(false);
    push("info", "🔄 Listo para una nueva pista");
  }, [push]);

  return {
    state,
    processing,
    analyzing,
    analysisProgress,
    mastering,
    chainProgress,
    mp3Progress,
    dirty,
    error,
    messages,
    loadFile,
    master,
    updateFixer,
    addFixer,
    removeFixer,
    download,
    reset,
  };
}
