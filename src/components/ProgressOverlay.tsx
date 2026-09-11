"use client";

/**
 * ProgressOverlay — overlay modal con la fase y porcentaje del análisis
 * en tiempo real (mientras se decodifica/analiza la pista).
 */

import type { AnalysisProgress } from "../lib/audio/types";

export function ProgressOverlay({ progress }: { progress: AnalysisProgress | null }) {
  if (!progress) return null;
  const pct = Math.round(progress.pct * 100);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 dark:shadow-black/40">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-ping rounded-full bg-teal-500" />
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{progress.phase}</p>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs text-zinc-500">
          <span>Analizando localmente…</span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  );
}
