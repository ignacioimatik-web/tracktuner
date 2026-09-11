import { describe, expect, it } from "vitest";
import { suggestedFixers, rebuildFixer, bandImbalance, FIXER_META } from "../src/lib/audio/fixers";
import { DEFAULT_PRESET } from "../src/lib/audio/fixers";
import type { Diagnostic } from "../src/lib/audio/types";

const diag = (kind: Diagnostic["kind"], severity = 0.8): Diagnostic => ({
  kind,
  severity,
  label: kind,
  description: kind,
  fixer: "eq",
});

describe("suggestedFixers", () => {
  it("propone los fixers correctos según el diagnóstico", () => {
    const issues = [diag("clipping", 0.9), diag("de-esser", 0.7), diag("loudness-too-high", 0.5)];
    const fixers = suggestedFixers(issues, DEFAULT_PRESET);
    const ids = fixers.map((f) => f.id);
    expect(ids).toContain("compressor");
    expect(ids).toContain("deesser");
    expect(ids).toContain("gain");
    // orden canónico: EQ → deesser → compressor → limiter → gain
    expect(ids.indexOf("deesser")).toBeLessThan(ids.indexOf("compressor"));
    expect(ids.indexOf("compressor")).toBeLessThan(ids.indexOf("gain"));
  });

  it("devuelve un preset base suave cuando no hay problemas", () => {
    const fixers = suggestedFixers([], DEFAULT_PRESET);
    expect(fixers.length).toBeGreaterThanOrEqual(2);
    expect(fixers.every((f) => f.enabled)).toBe(true);
  });

  it("todos los fixers tienen metadatos de UI", () => {
    for (const f of suggestedFixers([diag("clipping"), diag("eq-muddy"), diag("true-peak")], DEFAULT_PRESET)) {
      expect(FIXER_META[f.id]).toBeDefined();
      expect(f.meta.label.length).toBeGreaterThan(0);
      expect(f.meta.getMetric).toBeTypeOf("function");
    }
  });
});

describe("rebuildFixer", () => {
  it("conserva id y base al cambiar intensidad", () => {
    const [fixer] = suggestedFixers([diag("eq-muddy")], DEFAULT_PRESET);
    const rebuilt = rebuildFixer(fixer, 0.5);
    expect(rebuilt.id).toBe(fixer.id);
    expect(rebuilt.amount).toBe(0.5);
    expect(rebuilt.baseParams).toEqual(fixer.baseParams);
  });
});

describe("bandImbalance", () => {
  it("es 0 para un espectro plano", () => {
    const flat = { bands: [{ name: "a", low: 0, high: 1, energy: 1, deviationDb: 0 }] } as never;
    expect(bandImbalance(flat)).toBe(0);
  });
});
