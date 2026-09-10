"use client";

import type { AnalysisResult } from "../lib/audio/types";

function Meter({ label, value, max, unit, good }: { label: string; value: number; max: number; unit?: string; good: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="font-mono text-sm">
          {value.toFixed(1)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all ${good ? "bg-teal-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function MetricsPanel({ analysis }: { analysis: AnalysisResult }) {
  // escalas absolutas
  const lufsOffset = analysis.integratedLufs + 60; // para barra visual (rango -60..0)
  const lufsMax = 60;
  const peakOffset = analysis.truePeakDbtp + 10; // rango -10..0 dBTP
  const peakMax = 10;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Métricas
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Meter
          label="Loudness (LUFS)"
          value={lufsOffset}
          max={lufsMax}
          unit=""
          good={analysis.integratedLufs >= -18 && analysis.integratedLufs <= -9}
        />
        <Meter
          label="True peak (dBTP)"
          value={peakOffset}
          max={peakMax}
          unit=""
          good={analysis.truePeakDbtp <= -1}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Espectro por bandas
        </p>
        <div className="space-y-1.5">
          {analysis.bands.map((b) => (
            <div key={b.name} className="flex items-center gap-2">
              <span className="w-20 text-right font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                {b.low}-{b.high >= 1000 ? `${(b.high / 1000).toFixed(0)}k` : b.high}Hz
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700">
                <div
                  className={`h-full rounded ${b.deviationDb > 3 ? "bg-red-500" : b.deviationDb < -4 ? "bg-sky-500" : "bg-teal-500"}`}
                  style={{ width: `${Math.max(3, b.energy * 100)}%` }}
                />
              </div>
              <span className="w-10 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                {b.deviationDb >= 0 ? "+" : ""}
                {b.deviationDb.toFixed(1)}dB
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <p>
          Duración <span className="font-mono">{analysis.durationSec.toFixed(1)}s</span> · sample rate{" "}
          <span className="font-mono">{analysis.sampleRate}Hz</span> · clipping{" "}
          <span className="font-mono">{(analysis.clipRatio * 100).toFixed(3)}%</span>
        </p>
      </div>
    </div>
  );
}
