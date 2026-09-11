"use client";

/**
 * ChainView — cadena de mastering con telemetría en tiempo real.
 * Barra de progreso global + un fila por fixer con estado, progreso del render
 * y delta de métrica (antes → después) medida de verdad.
 */

import type { ChainProgress, Fixer, FixerRunResult } from "../lib/audio/types";
import { FIXER_META } from "../lib/audio/fixers";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "en cola", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
  rendering: { label: "renderizando…", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  measuring: { label: "midiendo…", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  done: { label: "aplicado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  error: { label: "error", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  disabled: { label: "desactivado", cls: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500" },
};

export function ChainView({
  fixers,
  chain,
  chainProgress,
  mastering,
}: {
  fixers: Fixer[];
  chain: FixerRunResult[];
  chainProgress: ChainProgress | null;
  mastering: boolean;
}) {
  const enabled = fixers.filter((f) => f.enabled);
  const overall = chainProgress?.overall ?? (chain.length > 0 ? 1 : 0);
  const pct = Math.round(overall * 100);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Cadena de mastering
        </h3>
        <span className="font-mono text-xs text-zinc-500">
          {chainProgress?.stepTotal ? `paso ${Math.min(chainProgress.stepIndex + 1, chainProgress.stepTotal)}/${chainProgress.stepTotal}` : `${enabled.length} pasos`}
        </span>
      </div>

      {/* progreso global */}
      <div className="mb-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={`h-full rounded-full transition-all ${mastering ? "bg-teal-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
          <span>{mastering ? "Procesando…" : pct === 100 ? "Completado" : "En cola"}</span>
          <span className="font-mono">{pct}%</span>
        </div>
      </div>

      {/* pasos */}
      <ul className="space-y-2">
        {enabled.map((f, i) => {
          const run = chain[i];
          const st = STATUS[run?.status ?? "pending"];
          const meta = FIXER_META[f.id] ?? f.meta;
          const stepPct = run ? Math.round((run.progress ?? 0) * 100) : 0;
          const improved =
            run?.status === "done"
              ? run.metricAfter < run.metricBefore ||
                (meta.betterWhen === "closer" && meta.target !== undefined
                  ? Math.abs(run.metricAfter - meta.target) < Math.abs(run.metricBefore - meta.target)
                  : false)
              : null;
          return (
            <li key={f.id} className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/30">
              <div className="flex items-center gap-2">
                <span className="text-base">{meta.icon}</span>
                <span className="flex-1 text-sm font-medium">{meta.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
              </div>

              {(run?.status === "rendering" || run?.status === "measuring") && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${Math.max(4, stepPct)}%` }}
                  />
                </div>
              )}

              {run?.status === "done" && (
                <p className="mt-1.5 font-mono text-[11px] text-zinc-500">
                  {meta.metricLabel}: {run.metricBefore.toFixed(1)} →{" "}
                  <span className={improved ? "font-semibold text-emerald-600" : "text-zinc-300"}>
                    {run.metricAfter.toFixed(1)}
                  </span>{" "}
                  {meta.metricUnit} <span className="text-zinc-300">· {(run.durationMs / 1000).toFixed(1)}s</span>
                </p>
              )}

              {run?.status === "error" && (
                <p className="mt-1.5 text-[11px] text-red-500">{run.error ?? "Fallo en este paso"}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
