/**
 * TrackTuner — tipos y constantes compartidas del motor de audio.
 * Definiciones SRP: cada dominio (análisis, diagnóstico, fixers, export) tiene sus propios tipos.
 */

/** Banda espectral usada en el diagnóstico de ecualización. */
export interface BandLevel {
  name: string;
  /** rango en Hz (información, no usado en el cálculo) */
  low: number;
  high: number;
  /** energía relativa de la banda 0..1 */
  energy: number;
  /** desviación respecto a la media del espectro, en dB (negativo = apagada) */
  deviationDb: number;
}

export type ProblemKind =
  | "clipping"
  | "true-peak"
  | "loudness-too-high"
  | "loudness-too-low"
  | "eq-muddy"
  | "eq-harsh"
  | "eq-dull"
  | "de-esser";

/** Un problema detectado en la pista, con su gravedad y el fix sugerido. */
export interface Diagnostic {
  kind: ProblemKind;
  /** 0..1 gravedad */
  severity: number;
  label: string;
  description: string;
  /** nombre del fixer que resuelve esto */
  fixer: string;
  /** metadatos concretos (p.ej. true peak medido, LUFS) */
  metrics?: Record<string, number | string>;
}

export interface AnalysisResult {
  sampleRate: number;
  channels: number;
  durationSec: number;
  /** loudness integrada (EBU R128), LUFS */
  integratedLufs: number;
  /** true peak, dBTP */
  truePeakDbtp: number;
  /** proporción de muestras en clipping (|x| >= 1.0) */
  clipRatio: number;
  /** niveles por banda espectral */
  bands: BandLevel[];
  /** proporción de energía en sibilancias 5-8kHz (para de-esser) */
  sibilanceRatio: number;
  issues: Diagnostic[];
}

/** Fixer listo para aplicarse en el grafo de audio. */
export interface Fixer {
  name: string;
  enabled: boolean;
  /** intensidad 0..1 */
  amount: number;
  /** crea y conecta el nodo que aplica el fix dentro del contexto dado */
  apply: (ctx: BaseAudioContext, input: AudioNode) => AudioNode;
  /** parámetros expuestos (para UI / ajuste fino) */
  params?: Record<string, number>;
}

/** Preset de procesado final, listo para aplicar. */
export interface PipelinePreset {
  name: string;
  targetLufs: number;
  /** true peak máximo permitido, dBTP */
  maxTruePeak: number;
  /** compresor de master */
  compressor: { threshold: number; ratio: number; attack: number; release: number };
  /** ecualización suave de master (dB por banda) */
  eq: { lowshelf: number; presence: number; highShelf: number };
  /** ganancia de make-up post-EQ, dB */
  makeupGain: number;
  /** reducción de sibilancia en dB (0 = off) */
  deEsserDb: number;
}
