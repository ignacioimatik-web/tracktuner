"use client";

import type { AnalysisResult } from "../lib/audio/types";

const PROBLEM_STYLES: Record<string, { icon: string; color: string }> = {
  clipping: { icon: "🔴", color: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" },
  "true-peak": { icon: "🟠", color: "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30" },
  "loudness-too-high": { icon: "📢", color: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" },
  "loudness-too-low": { icon: "🔇", color: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30" },
  "eq-muddy": { icon: "🌊", color: "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30" },
  "eq-harsh": { icon: "⚡", color: "border-fuchsia-300 bg-fuchsia-50 dark:border-fuchsia-800 dark:bg-fuchsia-950/30" },
  "eq-dull": { icon: "💤", color: "border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30" },
  "de-esser": { icon: "✂️", color: "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30" },
};

export function DiagnosticPanel({ analysis }: { analysis: AnalysisResult }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Diagnóstico
      </h3>

      {analysis.issues.length === 0 ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✅ No se detectaron problemas graves. Tu master suena limpio.
        </div>
      ) : (
        <ul className="space-y-2">
          {analysis.issues.map((iss, i) => {
            const style = PROBLEM_STYLES[iss.kind] ?? PROBLEM_STYLES.clipping;
            return (
              <li key={i} className={`rounded-xl border p-3 ${style.color}`}>
                <div className="flex items-center gap-2">
                  <span>{style.icon}</span>
                  <span className="font-semibold">{iss.label}</span>
                  <span className="ml-auto text-xs font-medium opacity-70">
                    severidad {(iss.severity * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1 text-sm opacity-80">{iss.description}</p>
                {iss.metrics &&
                  Object.entries(iss.metrics).map(([k, v]) => (
                    <span key={k} className="mt-1 mr-2 inline-block rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">
                      {k}: {typeof v === "number" ? v.toFixed(2) : v}
                    </span>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
