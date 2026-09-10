"use client";

/**
 * TrackTuner — hook de decodificación y procesado.
 * Decodifica el MP3 subido y orquesta análisis/arreglo/export.
 */

import { useCallback, useState } from "react";
import type { AnalysisResult, Fixer } from "../lib/audio/types";
import { exportWav } from "../lib/audio/export";

export interface TrackState {
  fileName: string;
  audioBuffer: AudioBuffer;
  analysis: AnalysisResult;
  fixedBuffer: AudioBuffer | null;
  fixers: Fixer[];
  processing: boolean;
  error: string | null;
}

export function useTrackProcessor() {
  const [state, setState] = useState<TrackState | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Decodifica un File de audio (MP3/WAV) a AudioBuffer. */
  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) {
      setError("Por favor sube un archivo de audio (MP3, WAV, M4A, OGG).");
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      const buf = await file.arrayBuffer();
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const decoded = await ctx.decodeAudioData(buf);
      // análisis inmediato
      const { runAnalysis } = await import("../lib/audio/pipeline");
      const analysis = runAnalysis(decoded);
      setState({
        fileName: file.name,
        audioBuffer: decoded,
        analysis,
        fixedBuffer: null,
        fixers: [],
        processing: false,
        error: null,
      });
      ctx.close();
    } catch (e) {
      setProcessing(false);
      setError(`No se pudo decodificar el audio: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  /** Ejecuta el arreglo completo (análisis → fixers → render offline). */
  const fixTrack = useCallback(async () => {
    if (!state) return;
    setProcessing(true);
    setError(null);
    try {
      const { processTrack } = await import("../lib/audio/pipeline");
      const result = await processTrack({ audioBuffer: state.audioBuffer });
      setState((s) => (s ? { ...s, fixedBuffer: result.fixedBuffer, fixers: result.fixers, processing: false } : s));
    } catch (e) {
      setProcessing(false);
      setError(`Error procesando la pista: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [state]);

  /** Descarga la pista arreglada como WAV. */
  const download = useCallback(
    (baseName?: string) => {
      if (!state?.fixedBuffer) return;
      const name = (baseName ?? state.fileName).replace(/\.[^.]+$/, "") + "-fixed.wav";
      exportWav(state.fixedBuffer, name);
    },
    [state],
  );

  const reset = useCallback(() => {
    setState(null);
    setError(null);
    setProcessing(false);
  }, []);

  return { state, processing, error, loadFile, fixTrack, download, reset };
}
