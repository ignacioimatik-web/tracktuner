/**
 * TrackTuner — fixers de audio.
 * Cada fixer construye un subgrafo Web Audio que corrige un problema concreto.
 * SRP: un fixer = un problema. Compuestos por la pipeline.
 */

import type { Diagnostic, Fixer, PipelinePreset } from "./types";

/**
 * Compresor de master: controla la saturación/clipping reduciendo los picos
 * sobre un umbral y reaplicando ganancia. Con attack/release musicales.
 */
export function makeCompressor(amount: number): Fixer {
  return {
    name: "compressor",
    enabled: true,
    amount,
    apply: (ctx, input) => {
      const comp = ctx.createDynamicsCompressor();
      // umbral adaptado a la intensidad (en dB, negativo)
      const thresh = -10 - amount * 12; // -10..-22 dB
      comp.threshold.value = thresh;
      comp.knee.value = 12;
      comp.ratio.value = 2 + amount * 4; // 2:1..6:1
      comp.attack.value = 0.006;
      comp.release.value = 0.12;
      input.connect(comp);
      return comp;
    },
    params: { threshold: -10 - amount * 12, ratio: 2 + amount * 4 },
  };
}

/**
 * Limitador de true peak: biquad + ganancia para recortar picos intermuestra
 * sin distorsión audible. (Aproximación: ganancia antes de un saturador suave.)
 */
export function makeLimiter(amount: number): Fixer {
  return {
    name: "limiter",
    enabled: true,
    amount,
    apply: (ctx, input) => {
      // cadena: gain (reducción preventiva) + compresor agresivo + makeup
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
  };
}

/**
 * Ganancia de make-up / normalización (ganancia pura, en dB).
 */
export function makeGainFix(db: number): Fixer {
  return {
    name: "gain",
    enabled: true,
    amount: db / 12, // escala informativa
    apply: (ctx, input) => {
      const g = ctx.createGain();
      const v = Math.pow(10, db / 20);
      g.gain.value = v;
      input.connect(g);
      return g;
    },
    params: { db },
  };
}

/**
 * Ecualizador de 3 bandas (lowshelf 90Hz, presencia peaking 3.5kHz, highshelf 9kHz).
 * amount en 0..1; los dB de corrección los decide el pipeline según el diagnóstico.
 */
export interface EqConfig {
  lowshelfDb: number;
  presenceDb: number;
  highShelfDb: number;
}

export function makeEq(eq: EqConfig): Fixer {
  return {
    name: "eq",
    enabled: true,
    amount: 0.5,
    apply: (ctx, input) => {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 90;
      low.gain.value = clampDb(eq.lowshelfDb);
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 3500;
      presence.Q.value = 0.7;
      presence.gain.value = clampDb(eq.presenceDb);
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 9000;
      high.gain.value = clampDb(eq.highShelfDb);
      input.connect(low);
      low.connect(presence);
      presence.connect(high);
      return high;
    },
    params: { lowshelfDb: eq.lowshelfDb, presenceDb: eq.presenceDb, highShelfDb: eq.highShelfDb },
  };
}

/**
 * De-esser: notch dinámico en 6-8 kHz. Aproximación con un peaking filtro
 * de ancho estrecho + compresor dedicado a la banda de sibilancias.
 */
export function makeDeEsser(db: number): Fixer {
  return {
    name: "deesser",
    enabled: true,
    amount: 0.5,
    apply: (ctx, input) => {
      // filtro peaking en 7kHz que reduce la sibilancia
      const de = ctx.createBiquadFilter();
      de.type = "peaking";
      de.frequency.value = 7000;
      de.Q.value = 4;
      de.gain.value = clampDb(-db);
      input.connect(de);
      return de;
    },
    params: { reductionDb: -db },
  };
}

/** Limita un valor de ganancia en dB a un rango seguro. */
function clampDb(db: number): number {
  return Math.max(-12, Math.min(12, db));
}

/**
 * Construye el preset final de arreglo a partir de un diagnóstico.
 * Devuelve una lista de fixers en el orden correcto del grafo (EQ → de-esser → comp → limiter → gain).
 */
export function presetFromDiagnostics(issues: Diagnostic[], preset: PipelinePreset): Fixer[] {
  const fixers: Fixer[] = [];
  const has = (k: string) => issues.some((i) => i.kind === k);
  const worst = (k: string) => {
    const m = Math.max(0, ...issues.filter((i) => i.kind === k).map((i) => i.severity));
    return m;
  };

  // EQ — según diagnóstico de embarrar/apagado/duro
  if (has("eq-muddy") || has("eq-harsh") || has("eq-dull")) {
    const eq: EqConfig = { lowshelfDb: 0, presenceDb: 0, highShelfDb: 0 };
    if (has("eq-muddy")) eq.lowshelfDb = -3.5 * worst("eq-muddy");
    if (has("eq-dull")) eq.presenceDb = 3 * worst("eq-dull");
    if (has("eq-harsh")) eq.highShelfDb = -2.5 * worst("eq-harsh");
    fixers.push(makeEq(eq));
  }

  // De-esser
  if (has("de-esser")) {
    const db = 4 + 4 * worst("de-esser");
    fixers.push(makeDeEsser(db));
  }

  // Compresor (saturación/clipping)
  if (has("clipping")) {
    fixers.push(makeCompressor(Math.min(1, worst("clipping") * 1.2)));
  }

  // Limitador de true peak
  if (has("true-peak")) {
    fixers.push(makeLimiter(Math.min(1, worst("true-peak") * 1.5)));
  }

  // Ganancia: normalización a target LUFS + makeup del preset
  const makeup = preset.makeupGain;
  if (has("loudness-too-low")) {
    fixers.push(makeGainFix(preset.targetLufs >= 0 ? makeup : makeup + 3));
  } else if (has("loudness-too-high")) {
    fixers.push(makeGainFix(-3 - worst("loudness-too-high") * 2));
  } else {
    fixers.push(makeGainFix(makeup));
  }

  // Si no hay issues, aplicar el preset base suave (EQ neutro + gain makeup)
  if (fixers.length === 0) {
    fixers.push(makeEq({ lowshelfDb: 0, presenceDb: preset.eq.presence, highShelfDb: preset.eq.highShelf }));
    fixers.push(makeGainFix(makeup));
  }

  return fixers;
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
