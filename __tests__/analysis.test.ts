import { describe, expect, it } from "vitest";
import { analyzeAudio } from "../src/lib/audio/analysis";

/** Sintetiza una señal de prueba mono. */
function synth(durationSec: number, sampleRate = 44100, gen: (i: number) => number): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = gen(i);
  return out;
}

describe("analyzeAudio", () => {
  it("detecta clipping en una señal al tope", () => {
    // onda cuadrada al tope = 50% de muestras en |x|>=1.0
    const samples = synth(0.5, 44100, (i) => (Math.sin(i * 0.1) > 0 ? 1.0 : -1.0));
    const r = analyzeAudio(samples, 44100);
    expect(r.clipRatio).toBeGreaterThan(0.3);
    expect(r.issues.some((i) => i.kind === "clipping")).toBe(true);
    // true peak al tope
    expect(r.truePeakDbtp).toBeCloseTo(0, 0);
  });

  it("no detecta clipping en una señal tranquila y limpia", () => {
    const samples = synth(0.5, 44100, (i) => 0.1 * Math.sin(i * 0.05));
    const r = analyzeAudio(samples, 44100);
    expect(r.clipRatio).toBeLessThan(1e-6);
    expect(r.issues.some((i) => i.kind === "clipping")).toBe(false);
  });

  it("reporta métricas básicas válidas", () => {
    const samples = synth(1.0, 22050, (i) => 0.5 * Math.sin(i * 0.02));
    const r = analyzeAudio(samples, 22050);
    expect(r.sampleRate).toBe(22050);
    expect(r.durationSec).toBeCloseTo(1.0, 1);
    expect(r.bands).toHaveLength(6);
    expect(r.integratedLufs).toBeLessThan(0);
  });
});
