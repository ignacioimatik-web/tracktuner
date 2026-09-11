/**
 * TrackTuner — fixers de audio.
 * Cada fixer construye un subgrafo Web Audio que corrige un problema concreto.
 * SRP: un fixer = un problema. Compuestos por la pipeline.
 *
 * v2: cada fixer lleva metadatos de presentación (FixerMeta) para que la UI
 * dibuje su botón, su ventana de información y su métrica antes/después.
 */

import type { AnalysisResult, Diagnostic, Fixer, FixerMeta, PipelinePreset } from "./types";

export interface EqConfig {
  lowshelfDb: number;
  presenceDb: number;
  highShelfDb: number;
}

/** Limita un valor de ganancia en dB a un rango seguro. */
function clampDb(db: number): number {
  return Math.max(-12, Math.min(12, db));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Desequilibrio espectral: suma de |desviación| de las 6 bandas (menor = espectro más plano). */
export function bandImbalance(r: AnalysisResult): number {
  return r.bands.reduce((acc, b) => acc + Math.abs(b.deviationDb), 0);
}

/** Metadatos de presentación por fixer (para botones, info windows y deltas). */
export const FIXER_META: Record<string, FixerMeta> = {
  eq: {
    id: "eq",
    label: "Ecualizador de máster",
    icon: "📊",
    description:
      "Suaviza graves embarrados, presencia apagada y brillos duros con shelves de máster (90 Hz, 3.5 kHz y 9 kHz).",
    metricLabel: "Equilibrio espectral",
    metricUnit: "dB",
    getMetric: bandImbalance,
    betterWhen: "lower",
    params: [
      { key: "lowshelfDb", label: "Lowshelf 90 Hz", unit: "dB" },
      { key: "presenceDb", label: "Presencia 3.5 kHz", unit: "dB" },
      { key: "highShelfDb", label: "High shelf 9 kHz", unit: "dB" },
    ],
  },
  deesser: {
    id: "deesser",
    label: "De-esser",
    icon: "✂️",
    description:
      "Reduce las sibilancias 5-8 kHz (eses y ches cortantes del vocal) con un notch en 7 kHz.",
    metricLabel: "Sibilancias",
    metricUnit: "×",
    getMetric: (r) => r.sibilanceRatio,
    betterWhen: "lower",
    params: [{ key: "reductionDb", label: "Reducción", unit: "dB" }],
  },
  compressor: {
    id: "compressor",
    label: "Compresor de picos",
    icon: "🎚️",
    description:
      "Domina el clipping y la saturación reduciendo los picos sobre un umbral, con knee suave y release musical.",
    metricLabel: "Clipping",
    metricUnit: "%",
    getMetric: (r) => r.clipRatio * 100,
    betterWhen: "lower",
    params: [
      { key: "threshold", label: "Umbral", unit: "dB" },
      { key: "ratio", label: "Ratio", unit: ":1" },
    ],
  },
  limiter: {
    id: "limiter",
    label: "Limitador true-peak",
    icon: "🛡️",
    description:
      "Evita picos intermuestra por encima de -1 dBTP para que la pista no distorsione en ningún reproductor ni plataforma.",
    metricLabel: "True peak",
    metricUnit: "dBTP",
    getMetric: (r) => r.truePeakDbtp,
    betterWhen: "lower",
    params: [{ key: "ceiling", label: "Techo", unit: "dBTP" }],
  },
  gain: {
    id: "gain",
    label: "Normalización LUFS",
    icon: "🔊",
    description:
      "Ajusta el nivel global para acercar la pista a -14 LUFS, el estándar de Spotify, Apple Music y YouTube.",
    metricLabel: "Loudness",
    metricUnit: "LUFS",
    getMetric: (r) => Math.abs(r.integratedLufs - -14),
    betterWhen: "closer",
    target: -14,
    params: [{ key: "db", label: "Ganancia", unit: "dB" }],
  },
};

/** Orden canónico de la cadena de mastering. */
export const FIXER_ORDER: string[] = ["eq", "deesser", "compressor", "limiter", "gain"];

interface FixerSpec {
  build: (
    base: Record<string, number>,
    amount: number,
  ) => { apply: (ctx: BaseAudioContext, input: AudioNode) => AudioNode; params: Record<string, number> };
}

const SPECS: Record<string, FixerSpec> = {
  eq: {
    build: (base, amount) => {
      const e: EqConfig = {
        lowshelfDb: (base.lowshelfDb ?? 0) * amount,
        presenceDb: (base.presenceDb ?? 0) * amount,
        highShelfDb: (base.highShelfDb ?? 0) * amount,
      };
      return {
        apply: (ctx, input) => {
          const low = ctx.createBiquadFilter();
          low.type = "lowshelf";
          low.frequency.value = 90;
          low.gain.value = clampDb(e.lowshelfDb);
          const presence = ctx.createBiquadFilter();
          presence.type = "peaking";
          presence.frequency.value = 3500;
          presence.Q.value = 0.7;
          presence.gain.value = clampDb(e.presenceDb);
          const high = ctx.createBiquadFilter();
          high.type = "highshelf";
          high.frequency.value = 9000;
          high.gain.value = clampDb(e.highShelfDb);
          input.connect(low);
          low.connect(presence);
          presence.connect(high);
          return high;
        },
        params: {
          lowshelfDb: round2(e.lowshelfDb),
          presenceDb: round2(e.presenceDb),
          highShelfDb: round2(e.highShelfDb),
        },
      };
    },
  },
  deesser: {
    build: (base, amount) => {
      const db = (base.reductionDb ?? 4) * amount;
      return {
        apply: (ctx, input) => {
          const de = ctx.createBiquadFilter();
          de.type = "peaking";
          de.frequency.value = 7000;
          de.Q.value = 4;
          de.gain.value = clampDb(-db);
          input.connect(de);
          return de;
        },
        params: { reductionDb: round2(db) },
      };
    },
  },
  compressor: {
    build: (_base, amount) => {
      return {
        apply: (ctx, input) => {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -10 - amount * 12; // -10..-22 dB
          comp.knee.value = 12;
          comp.ratio.value = 2 + amount * 4; // 2:1..6:1
          comp.attack.value = 0.006;
          comp.release.value = 0.12;
          input.connect(comp);
          return comp;
        },
        params: { threshold: Math.round(-10 - amount * 12), ratio: Math.round((2 + amount * 4) * 10) / 10 },
      };
    },
  },
  limiter: {
    build: (_base, amount) => {
      return {
        apply: (ctx, input) => {
          const pre = ctx.createGain();
          pre.gain.value = 1 - amount * 0.06;
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -1.0;
          comp.knee.value = 0.5;
          comp.ratio.value = 20;
          comp.attack.value = 0.001;
          comp.release.value = 0.05;
          input.connect(pre);
          pre.connect(comp);
          return comp;
        },
        params: { ceiling: -1.0 },
      };
    },
  },
  gain: {
    build: (base, amount) => {
      const db = (base.db ?? 0) * amount;
      return {
        apply: (ctx, input) => {
          const g = ctx.createGain();
          g.gain.value = Math.pow(10, db / 20);
          input.connect(g);
          return g;
        },
        params: { db: round2(db) },
      };
    },
  },
};

/** Crea un fixer a partir de su id, parámetros base derivados del diagnóstico y la intensidad. */
export function createFixer(id: string, baseParams: Record<string, number>, amount: number, enabled = true): Fixer {
  const spec = SPECS[id] ?? SPECS.gain;
  const built = spec.build(baseParams, amount);
  const meta = FIXER_META[id] ?? FIXER_META.gain;
  return {
    id,
    name: id,
    enabled,
    amount,
    baseParams: { ...baseParams },
    meta,
    apply: built.apply,
    params: built.params,
  };
}

/** Reconstruye un fixer con nueva intensidad (conserva base y estado). */
export function rebuildFixer(f: Fixer, amount: number, enabled?: boolean): Fixer {
  return createFixer(f.id, f.baseParams, amount, enabled ?? f.enabled);
}

/** Configuración neutra (manual, no sugerida por el diagnóstico) por tipo de fixer. */
const NEUTRAL: Record<string, { base: Record<string, number>; amount: number }> = {
  eq: { base: { lowshelfDb: 0, presenceDb: 1.5, highShelfDb: 1 }, amount: 0.5 },
  deesser: { base: { reductionDb: 4 }, amount: 0.5 },
  compressor: { base: {}, amount: 0.4 },
  limiter: { base: {}, amount: 0.5 },
  gain: { base: { db: 4 }, amount: 0.5 },
};

/** Fixer desactivado por defecto, para ofrecer mejoras manuales opcionales. */
export function neutralFixer(id: string): Fixer {
  const n = NEUTRAL[id] ?? { base: {}, amount: 0.5 };
  return createFixer(id, n.base, n.amount, false);
}

/**
 * Construye la cadena SUGERIDA por el diagnóstico (solo los fixers que resuelven
 * problemas detectados), en el orden correcto del grafo (EQ → de-esser → comp → limiter → gain).
 */
export function suggestedFixers(issues: Diagnostic[], preset: PipelinePreset): Fixer[] {
  const out: Fixer[] = [];
  const has = (k: string) => issues.some((i) => i.kind === k);
  const worst = (k: string) => {
    const m = Math.max(0, ...issues.filter((i) => i.kind === k).map((i) => i.severity));
    return m;
  };

  // EQ — según diagnóstico de embarrar/apagado/duro
  if (has("eq-muddy") || has("eq-harsh") || has("eq-dull")) {
    const base: Record<string, number> = { lowshelfDb: 0, presenceDb: 0, highShelfDb: 0 };
    if (has("eq-muddy")) base.lowshelfDb = -3.5 * worst("eq-muddy");
    if (has("eq-dull")) base.presenceDb = 3 * worst("eq-dull");
    if (has("eq-harsh")) base.highShelfDb = -2.5 * worst("eq-harsh");
    out.push(createFixer("eq", base, 1));
  }

  // De-esser
  if (has("de-esser")) {
    out.push(createFixer("deesser", { reductionDb: 4 + 4 * worst("de-esser") }, 1));
  }

  // Compresor (saturación/clipping)
  if (has("clipping")) {
    out.push(createFixer("compressor", {}, Math.min(1, worst("clipping") * 1.2)));
  }

  // Limitador de true peak
  if (has("true-peak")) {
    out.push(createFixer("limiter", {}, Math.min(1, worst("true-peak") * 1.5)));
  }

  // Ganancia: normalización a target LUFS + makeup del preset
  const makeup = preset.makeupGain;
  let db = makeup;
  if (has("loudness-too-low")) db = makeup + 3;
  else if (has("loudness-too-high")) db = -3 - worst("loudness-too-high") * 2;

  if (issues.length > 0) {
    out.push(createFixer("gain", { db }, 1));
  } else {
    // Sin problemas: preset base suave (EQ neutro + gain makeup)
    out.push(createFixer("eq", { lowshelfDb: 0, presenceDb: preset.eq.presence, highShelfDb: preset.eq.highShelf }, 1));
    out.push(createFixer("gain", { db: makeup }, 1));
  }

  return out;
}

/** Preset por defecto (objetivo streaming). */
export const DEFAULT_PRESET: PipelinePreset = {
  name: "Streaming-ready",
  targetLufs: -14,
  maxTruePeak: -1.0,
  compressor: { threshold: -12, ratio: 3, attack: 0.006, release: 0.12 },
  eq: { lowshelf: 0, presence: 1.5, highShelf: 1.0 },
  makeupGain: 0,
  deEsserDb: 5,
};
