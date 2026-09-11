"use client";

/**
 * FixerCard — botón + ventana de información por cada tipo de mejora.
 * Muestra: estado (pendiente/renderizando/midiendo/aplicado/error), toggle,
 * slider de intensidad y, tras el mastering, la métrica real antes→después.
 */

import { useState } from "react";
import type { Fixer, FixerRunResult } from "../lib/audio/types";

const STATUS_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  pending: { dot: "bg-zinc-300 dark:bg-zinc-600", label: "pendiente", text: "text-zinc-500" },
  rendering: { dot: "bg-amber-400 animate-pulse", label: "renderizando…", text: "text-amber-600" },
  measuring: { dot: "bg-sky-400 animate-pulse", label: "midiendo…", text: "text-sky-600" },
  done: { dot: "bg-emerald-500", label: "aplicado", text: "text-emerald-600" },
  disabled: { dot: "bg-zinc-300 dark:bg-zinc-700", label: "desactivado", text: "text-zinc-400" },
  error: { dot: "bg-red-500", label: "error", text: "text-red-600" },
};

function isBetter(meta: Fixer["meta"], before: number, after: number): boolean {
  if (meta.betterWhen === "lower") return after < before;
  if (meta.betterWhen === "higher") return after > before;
  if (meta.betterWhen === "closer" && meta.target !== undefined)
    return Math.abs(after - meta.target) < Math.abs(before - meta.target);
  return false;
}

export function FixerCard({
  fixer,
  run,
  onChange,
  onRemove,
  disabled,
}: {
  fixer: Fixer;
  run?: FixerRunResult;
  onChange: (patch: { amount?: number; enabled?: boolean }) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const m = fixer.meta;
  const statusKey = !fixer.enabled ? "disabled" : (run?.status ?? "pending");
  const st = STATUS_STYLE[statusKey];
  const done = run?.status === "done";
  const improved = done ? isBetter(m, run!.metricBefore, run!.metricAfter) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60">
      {/* Cabecera: botón del fixer */}
      <div className="flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-lg dark:bg-teal-900/40">
          {m.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{m.label}</span>
            <span className={`flex items-center gap-1 text-[11px] ${st.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
              {st.label}
            </span>
          </div>
          {done && (
            <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
              {m.metricLabel}: <span className="text-zinc-400">{run!.metricBefore.toFixed(1)}</span>
              {" → "}
              <span className={improved ? "font-semibold text-emerald-600" : "text-zinc-300"}>{run!.metricAfter.toFixed(1)}</span>{" "}
              {m.metricUnit}
            </p>
          )}
        </div>

        {/* Toggle activar/desactivar */}
        <button
          onClick={() => onChange({ enabled: !fixer.enabled })}
          disabled={disabled}
          aria-label={`${fixer.enabled ? "Desactivar" : "Activar"} ${m.label}`}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
            fixer.enabled ? "bg-teal-600" : "bg-zinc-300 dark:bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              fixer.enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>

        {/* Botón ventana de información */}
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-label={`Información de ${m.label}`}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm transition ${
            open
              ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
              : "border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          } disabled:opacity-40`}
        >
          {open ? "✕" : "ℹ️"}
        </button>
      </div>

      {/* Ventana de información */}
      {open && (
        <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{m.description}</p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {fixer.meta.params.map((p) => {
              const v = fixer.params[p.key];
              return (
                <div key={p.key} className="rounded-lg bg-white px-2.5 py-1.5 dark:bg-zinc-900">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-400">{p.label}</p>
                  <p className="font-mono text-sm">
                    {typeof v === "number" ? (Math.abs(v) < 0.05 && v !== 0 ? v : v.toFixed(1)) : v} <span className="text-[10px] text-zinc-400">{p.unit}</span>
                  </p>
                </div>
              );
            })}
          </div>

          {done && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-zinc-400">Resultado medido ({run!.durationMs / 1000}s)</p>
              <p className={`mt-0.5 font-mono ${improved ? "text-emerald-600" : "text-zinc-300"}`}>
                {m.metricLabel}: {run!.metricBefore.toFixed(1)} → {run!.metricAfter.toFixed(1)} {m.metricUnit}
                {improved ? " ✓" : ""}
              </p>
            </div>
          )}

          {fixer.enabled && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[11px] font-medium text-zinc-500">Intensidad</label>
                <span className="font-mono text-[11px] text-zinc-500">{Math.round(fixer.amount * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={fixer.amount}
                disabled={disabled}
                onChange={(e) => onChange({ amount: Number(e.target.value) })}
                className="w-full accent-teal-600 disabled:opacity-40"
              />
            </div>
          )}

          {onRemove && (
            <button
              onClick={onRemove}
              disabled={disabled}
              className="mt-3 text-[11px] font-medium text-red-500 transition hover:text-red-600 disabled:opacity-40"
            >
              Quitar de la cadena
            </button>
          )}
        </div>
      )}
    </div>
  );
}
