/**
 * TrackTuner — worker de análisis.
 * Ejecuta el análisis completo (LUFS, true peak, clipping, espectro, diagnóstico)
 * fuera del hilo principal y reporta progreso por fases en tiempo real.
 */

import { analyzeAudio } from "./analysis";
import type { AnalysisResult } from "./types";

interface WorkerRequest {
  id: number;
  samples: Float32Array;
  sampleRate: number;
}

type WorkerMessage =
  | { id: number; type: "progress"; phase: string; pct: number }
  | { id: number; type: "done"; result: AnalysisResult }
  | { id: number; type: "error"; error: string };

// `self` en un worker clásico: postMessage para responder.
const scope = self as unknown as {
  postMessage: (m: WorkerMessage) => void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, samples, sampleRate } = e.data;
  try {
    const result = analyzeAudio(samples, sampleRate, {
      onProgress: (p) => scope.postMessage({ id, type: "progress", phase: p.phase, pct: p.pct }),
    });
    scope.postMessage({ id, type: "done", result });
  } catch (err) {
    scope.postMessage({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
