"use client";

/**
 * ConsoleLog — consola en tiempo real del procesado.
 * Mensajes del hook (carga, análisis, cada paso del mastering, exportaciones).
 */

import { useEffect, useRef } from "react";
import type { ConsoleMessage } from "../lib/audio/types";

const LEVEL_STYLE: Record<string, string> = {
  info: "text-zinc-500 dark:text-zinc-400",
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
  step: "text-teal-600 dark:text-teal-400 font-semibold",
};

const LEVEL_DOT: Record<string, string> = {
  info: "bg-zinc-400",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  step: "bg-teal-500",
};

export function ConsoleLog({ messages }: { messages: ConsoleMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-950 dark:border-zinc-700">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">Consola de procesado</span>
      </div>
      <div ref={ref} className="h-44 space-y-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {messages.length === 0 && <p className="text-zinc-600">Sin actividad todavía…</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2">
            <span className="shrink-0 text-zinc-600">{m.time}</span>
            <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[m.level] ?? "bg-zinc-500"}`} />
            <span className={LEVEL_STYLE[m.level] ?? "text-zinc-400"}>{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
