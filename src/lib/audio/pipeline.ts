/**
 * TrackTuner — pipeline de procesado.
 * Orquesta: decodificar MP3 → analizar → generar fixers → renderizar offline → devolver audio.
 * Todo client-side; no toca el servidor.
 */

import { analyzeAudio } from "./analysis";
import { DEFAULT_PRESET, presetFromDiagnostics } from "./fixers";
import type { AnalysisResult, Fixer, PipelinePreset } from "./types";

export interface PipelineInput {
  audioBuffer: AudioBuffer;
  preset?: PipelinePreset;
}

export interface PipelineOutput {
  analysis: AnalysisResult;
  fixedBuffer: AudioBuffer;
  fixers: Fixer[];
}

/**
 * Analiza el buffer y construye el diagnóstico completo (sin renderizar aún).
 */
export function runAnalysis(audioBuffer: AudioBuffer): AnalysisResult {
  const { samples } = mixToMono(audioBuffer);
  return analyzeAudio(samples, audioBuffer.sampleRate, { targetLufs: DEFAULT_PRESET.targetLufs });
}

/**
 * Ejecuta el arreglo completo: análisis → fixers → render offline.
 */
export async function processTrack(input: PipelineInput): Promise<PipelineOutput> {
  const preset = input.preset ?? DEFAULT_PRESET;
  const analysis = runAnalysis(input.audioBuffer);

  // construimos el grafo de fixers
  const fixers = presetFromDiagnostics(analysis.issues, preset);

  // render offline en el mismo sampleRate
  const ctx = new OfflineAudioContext(
    input.audioBuffer.numberOfChannels,
    input.audioBuffer.length,
    input.audioBuffer.sampleRate,
  );

  // buffer de origen
  const src = ctx.createBufferSource();
  src.buffer = input.audioBuffer;
  src.connect(ctx.destination);

  // cadena de fixers
  let node: AudioNode = src;
  for (const f of fixers) {
    if (!f.enabled) continue;
    node = f.apply(ctx, node);
  }
  node.connect(ctx.destination);

  const rendered = await ctx.startRendering();
  return { analysis, fixedBuffer: rendered, fixers };
}

/** Mezcla a mono (promedio de canales) para el análisis. */
export function mixToMono(buffer: AudioBuffer): { samples: Float32Array; channels: number } {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) {
    return { samples: buffer.getChannelData(0), channels: 1 };
  }
  const out = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) out[i] += data[i];
  }
  const scale = 1 / numberOfChannels;
  for (let i = 0; i < length; i++) out[i] *= scale;
  return { samples: out, channels: numberOfChannels };
}
