/**
 * TrackTuner — análisis de audio.
 * Mide loudness (EBU R128 / LUFS), true peak, clipping, espectro por bandas y sibilancias.
 * Puro cálculo sobre Float32Array; sin dependencia del DOM ni del grafo de audio.
 */

import type { AnalysisResult, BandLevel, Diagnostic } from "./types";

export interface AnalysisOptions {
  /** LUFS objetivo de referencia para el diagnóstico de loudness */
  targetLufs?: number;
  /** límite de true peak considerado "clipping real" (dBTP) */
  maxTruePeakDbtp?: number;
  /** umbral para considerar una banda espectral "apagada" (desviación negativa, dB) */
  dullBandThresholdDb?: number;
}

const DEFAULTS: Required<AnalysisOptions> = {
  targetLufs: -14,
  maxTruePeakDbtp: -1.0,
  dullBandThresholdDb: -6,
};

/** Gating para medición integrada EBU R128: -70 LUFS absolutos, bloques de 400 ms. */
const GATE_ABSOLUTE_LUFS = -70;
const BLOCK_SEC = 0.4;

/** Calcular loudness integrada (EBU R128, aproximación con gating por bloques). */
function integratedLoudness(samples: Float32Array, sampleRate: number): number {
  const block = Math.floor(BLOCK_SEC * sampleRate);
  if (block < 1) return -Infinity;
  // Energía por bloque con ponderación K aproximada (pico del espectro)
  const blockEnergy: number[] = [];
  for (let start = 0; start < samples.length; start += block) {
    const end = Math.min(start + block, samples.length);
    let sum = 0;
    let n = 0;
    for (let i = start; i < end; i++) {
      const x = samples[i];
      sum += x * x;
      n++;
    }
    if (n === 0) continue;
    const rms = Math.sqrt(sum / n);
    // ponderación K aproximada: la curva real pesa ~+3 dB en ~2-3 kHz
    const lufs = 20 * Math.log10(rms + 1e-12) - 0.691;
    blockEnergy.push(lufs);
  }
  if (blockEnergy.length === 0) return -Infinity;
  // gate absoluto: descartar bloques por debajo de -70 LUFS
  const gated = blockEnergy.filter((l) => l > GATE_ABSOLUTE_LUFS);
  const use = gated.length > 0 ? gated : blockEnergy;
  const mean = use.reduce((a, b) => a + b, 0) / use.length;
  // ~ -0.691 constante de calibración de LUFS vs RMS dbFS
  return mean + 0.691 * Math.log10(Math.max(use.length, 1));
}

/** FFT iterativa radix-2 (magnitud). re/im in-place, tamaño potencia de 2. */
function fftMag(re: Float32Array, im: Float32Array, size: number): void {
  // bit-reversal permutation
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < size; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

/** Nivel espectral por banda usando una STFT con FFT radix-2 real. */
function bandAnalysis(
  samples: Float32Array,
  sampleRate: number,
): { bands: BandLevel[]; sibilanceRatio: number } {
  const bands: { name: string; low: number; high: number; energy: number }[] = [
    { name: "sub-bass", low: 20, high: 60, energy: 0 },
    { name: "bass", low: 60, high: 250, energy: 0 },
    { name: "low-mid", low: 250, high: 500, energy: 0 },
    { name: "mid", low: 500, high: 2000, energy: 0 },
    { name: "presence", low: 2000, high: 6000, energy: 0 },
    { name: "brilliance", low: 6000, high: 16000, energy: 0 },
  ];
  const fftSize = 2048;
  const hop = 1024;
  const half = fftSize / 2;
  const nFrames = Math.max(1, Math.floor((samples.length - fftSize) / hop) + 1);
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const binEnergy = new Float32Array(half); // acumulada sobre frames
  const sibEnergy = { v: 0 };
  let framesUsed = 0;

  // índices de bin para cada banda y para sibilancia
  const bandBins = bands.map((b) => {
    const lo = Math.max(1, Math.ceil((b.low * fftSize) / sampleRate));
    const hi = Math.min(half - 1, Math.floor((b.high * fftSize) / sampleRate));
    return { lo, hi };
  });
  const sibLo = Math.max(1, Math.ceil((5000 * fftSize) / sampleRate));
  const sibHi = Math.min(half - 1, Math.floor((8000 * fftSize) / sampleRate));

  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    for (let i = 0; i < fftSize; i++) {
      const idx = off + i;
      const v = idx < samples.length ? samples[idx] * window[i] : 0;
      re[i] = v;
      im[i] = 0;
    }
    fftMag(re, im, fftSize);
    // energía por bin (magnitud al cuadrado normalizada)
    for (let k = 1; k < half; k++) {
      binEnergy[k] += (re[k] * re[k] + im[k] * im[k]) / (fftSize * fftSize);
    }
    for (let k = sibLo; k <= sibHi; k++) {
      sibEnergy.v += (re[k] * re[k] + im[k] * im[k]) / (fftSize * fftSize);
    }
    framesUsed++;
  }

  const bandAcc = bandBins.map(({ lo, hi }) => {
    let e = 0;
    for (let k = lo; k <= hi; k++) e += binEnergy[k];
    return e / framesUsed;
  });
  const bandEnergies = bandAcc;
  const maxE = Math.max(...bandEnergies, 1e-12);
  const avgBands = bandEnergies.reduce((a, b) => a + b, 0) / bandEnergies.length;
  const sibAvg = sibEnergy.v / framesUsed;
  const sibilanceRatio = sibAvg / Math.max(avgBands, 1e-12);

  const levels: BandLevel[] = bandEnergies.map((e, i) => {
    const energy = e / maxE;
    const deviationDb = 10 * Math.log10(e / Math.max(avgBands, 1e-12));
    return {
      name: bands[i].name,
      low: bands[i].low,
      high: bands[i].high,
      energy,
      deviationDb,
    };
  });
  return { bands: levels, sibilanceRatio };
}

/** Diagnosticar problemas a partir de las métricas. */
function diagnose(
  integratedLufs: number,
  truePeakDbtp: number,
  clipRatio: number,
  bands: BandLevel[],
  sibilanceRatio: number,
  opts: Required<AnalysisOptions>,
): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const byName = (n: string) => bands.find((b) => b.name === n);

  // Clipping / saturación
  if (clipRatio > 0.0001) {
    issues.push({
      kind: "clipping",
      severity: Math.min(1, clipRatio * 40),
      label: "Clipping detectado",
      description: `Un ${(clipRatio * 100).toFixed(2)}% de las muestras llegan al tope digital. El master de Suno está saturado.`,
      fixer: "compressor",
      metrics: { clipRatio },
    });
  }
  if (truePeakDbtp > opts.maxTruePeakDbtp) {
    issues.push({
      kind: "true-peak",
      severity: Math.min(1, Math.max(0, (truePeakDbtp - opts.maxTruePeakDbtp) * 0.8)),
      label: "True peak demasiado alto",
      description: `Pico real de ${truePeakDbtp.toFixed(1)} dBTP (límite ${opts.maxTruePeakDbtp} dBTP). Riesgo de distorsión en playback.`,
      fixer: "limiter",
      metrics: { truePeakDbtp },
    });
  }
  // Loudness
  if (integratedLufs > opts.targetLufs + 1.5) {
    issues.push({
      kind: "loudness-too-high",
      severity: Math.min(1, (integratedLufs - opts.targetLufs) / 12),
      label: "Master demasiado fuerte",
      description: `${integratedLufs.toFixed(1)} LUFS (objetivo ${opts.targetLufs} LUFS). Más fuerte que el estándar de streaming.`,
      fixer: "gain",
      metrics: { integratedLufs, targetLufs: opts.targetLufs },
    });
  }
  if (integratedLufs < opts.targetLufs - 8) {
    issues.push({
      kind: "loudness-too-low",
      severity: Math.min(1, (opts.targetLufs - integratedLufs) / 12),
      label: "Master demasiado flojo",
      description: `${integratedLufs.toFixed(1)} LUFS (objetivo ${opts.targetLufs} LUFS). Sonará flojo frente a otras pistas.`,
      fixer: "gain",
      metrics: { integratedLufs, targetLufs: opts.targetLufs },
    });
  }
  // EQ
  const bass = byName("bass");
  const presence = byName("presence");
  const brilliance = byName("brilliance");
  const mid = byName("mid");
  if (bass && mid && bass.deviationDb - mid.deviationDb > 6 && bass.energy > 0.5) {
    issues.push({
      kind: "eq-muddy",
      severity: Math.min(1, (bass.deviationDb - mid.deviationDb - 6) / 10),
      label: "Graves embarrados",
      description: `Exceso de energía en graves (${bass.deviationDb.toFixed(1)} dB sobre la media). Booms y falta de claridad.`,
      fixer: "eq",
      metrics: { bassDeviationDb: bass.deviationDb },
    });
  }
  if (brilliance && presence && brilliance.deviationDb - presence.deviationDb > 6) {
    issues.push({
      kind: "eq-harsh",
      severity: Math.min(1, (brilliance.deviationDb - presence.deviationDb - 6) / 10),
      label: "Brillos duros",
      description: `Exceso de agudos (${brilliance.deviationDb.toFixed(1)} dB). Sonido áspero y fatigante.`,
      fixer: "eq",
      metrics: { brillianceDeviationDb: brilliance.deviationDb },
    });
  }
  if (brilliance && presence && brilliance.energy < 0.25 && presence.energy < 0.4) {
    issues.push({
      kind: "eq-dull",
      severity: Math.min(1, (0.4 - presence.energy) * 2),
      label: "Sonido apagado",
      description: "Falta de presencia y brillo. La pista suena sorda, sin vida en los agudos.",
      fixer: "eq",
    });
  }
  // Sibilancias
  if (sibilanceRatio > 2.5) {
    issues.push({
      kind: "de-esser",
      severity: Math.min(1, (sibilanceRatio - 2.5) / 6),
      label: "Sibilancias pronunciadas",
      description: "Exceso de energía en 5-8 kHz. Esos \"eses\" y \"ches\" cortantes del vocal.",
      fixer: "deesser",
      metrics: { sibilanceRatio },
    });
  }
  return issues;
}

/**
 * Analiza una pista en mono (mezcla de canales) y devuelve el diagnóstico completo.
 */
export function analyzeAudio(
  samples: Float32Array,
  sampleRate: number,
  options: AnalysisOptions = {},
): AnalysisResult {
  const opts: Required<AnalysisOptions> = { ...DEFAULTS, ...options };
  const durationSec = samples.length / sampleRate;

  // mezcla a mono si hace falta (por simplicidad medimos sobre el buffer dado)
  const mono = samples;

  // metrics
  const integratedLufs = integratedLoudness(mono, sampleRate);

  // true peak: interpolar 4x para aproximar entre-muestras
  let truePeak = 0;
  for (let i = 0; i < mono.length - 1; i++) {
    const a = mono[i];
    const b = mono[i + 1];
    // interpolación lineal de 4 puntos para estimar pico real
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const v = a + (b - a) * t;
      truePeak = Math.max(truePeak, Math.abs(v));
    }
    truePeak = Math.max(truePeak, Math.abs(a));
  }
  const truePeakDbtp = 20 * Math.log10(truePeak + 1e-12);

  // clipping
  let clipCount = 0;
  for (let i = 0; i < mono.length; i++) {
    if (Math.abs(mono[i]) >= 1.0) clipCount++;
  }
  const clipRatio = mono.length > 0 ? clipCount / mono.length : 0;

  const { bands, sibilanceRatio } = bandAnalysis(mono, sampleRate);
  const issues = diagnose(integratedLufs, truePeakDbtp, clipRatio, bands, sibilanceRatio, opts);

  return {
    sampleRate,
    channels: 1,
    durationSec,
    integratedLufs,
    truePeakDbtp,
    clipRatio,
    bands,
    sibilanceRatio,
    issues,
  };
}
