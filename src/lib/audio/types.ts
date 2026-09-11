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
  /** id del fixer que resuelve esto (eq | deesser | compressor | limiter | gain) */
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

/** Progreso del análisis (para mostrarlo en tiempo real). */
export interface AnalysisProgress {
  phase: string;
  /** 0..1 */
  pct: number;
}

/** Metadatos de presentación + métrica objetivo de un fixer (para UI/info windows). */
export interface FixerMeta {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** qué mide el fixer para mostrar el antes/después */
  metricLabel: string;
  metricUnit: string;
  /** extrae el valor numérico de la métrica desde un análisis */
  getMetric: (r: AnalysisResult) => number;
  /** dirección buena: menor es mejor, mayor es mejor, o cerca de target */
  betterWhen: "lower" | "higher" | "closer";
  target?: number;
  /** parámetros expuestos en la ventana de información */
  params: { key: string; label: string; unit: string }[];
}

/** Fixer listo para aplicarse en el grafo de audio. */
export interface Fixer {
  /** id canónico: eq | deesser | compressor | limiter | gain */
  id: string;
  name: string;
  enabled: boolean;
  /** intensidad 0..1 */
  amount: number;
  /** parámetros base derivados del diagnóstico (para reconstruir al cambiar amount) */
  baseParams: Record<string, number>;
  meta: FixerMeta;
  /** crea y conecta el nodo que aplica el fix dentro del contexto dado */
  apply: (ctx: BaseAudioContext, input: AudioNode) => AudioNode;
  /** parámetros concretos aplicados (para la info window) */
  params: Record<string, number>;
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

/** Estado de un paso de la cadena de mastering. */
export type FixerStatus = "pending" | "rendering" | "measuring" | "done" | "disabled" | "error";

/** Resultado de aplicar UN fixer sobre el audio (antes/después medido de verdad). */
export interface FixerRunResult {
  fixerId: string;
  status: FixerStatus;
  /** 0..1 (progreso del render de este paso) */
  progress: number;
  before: AnalysisResult;
  after: AnalysisResult;
  /** valor de la métrica objetivo antes */
  metricBefore: number;
  /** valor de la métrica objetivo después */
  metricAfter: number;
  durationMs: number;
  error?: string;
}

/** Progreso global de la cadena. */
export interface ChainProgress {
  overall: number;
  stepIndex: number;
  stepTotal: number;
}

/** Resultado completo del mastering. */
export interface MasterResult {
  buffer: AudioBuffer;
  analysis: AnalysisResult;
  chain: FixerRunResult[];
  elapsedMs: number;
}

export type ConsoleLevel = "info" | "ok" | "warn" | "error" | "step";

export interface ConsoleMessage {
  id: number;
  time: string;
  level: ConsoleLevel;
  text: string;
}
