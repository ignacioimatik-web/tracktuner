"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reproductor con comparación A/B (original vs arreglado).
 */
export function Player({ original, fixed }: { original: AudioBuffer; fixed: AudioBuffer | null }) {
  const [playing, setPlaying] = useState(false);
  const [which, setWhich] = useState<"original" | "fixed">("fixed");
  const [pos, setPos] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const duration = fixed ? fixed.duration : original.duration;

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close();
    };
  }, []);

  const play = () => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = ctxRef.current ?? new Ctx();
    ctxRef.current = ctx;
    const buffer = which === "fixed" && fixed ? fixed : original;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setPos(0);
    };
    src.start(0, pos);
    setPlaying(true);

    const tick = () => {
      setPos(ctx.currentTime - (0 + pos));
      if (pos >= duration) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stop = () => {
    ctxRef.current?.close();
    ctxRef.current = null;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    setPos(0);
  };

  const pct = duration > 0 ? (pos / duration) * 100 : 0;
  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={playing ? stop : play}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-600 text-lg text-white transition hover:bg-teal-700"
          aria-label={playing ? "Detener" : "Reproducir"}
        >
          {playing ? "■" : "▶"}
        </button>

        {/* toggle A/B */}
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-600">
          <button
            onClick={() => {
              setWhich("fixed");
              stop();
            }}
            disabled={!fixed}
            className={`px-3 py-1.5 text-sm font-medium ${
              which === "fixed" && fixed ? "bg-teal-600 text-white" : "bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Arreglado
          </button>
          <button
            onClick={() => {
              setWhich("original");
              stop();
            }}
            className={`px-3 py-1.5 text-sm font-medium ${
              which === "original" ? "bg-teal-600 text-white" : "bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            Original
          </button>
        </div>

        <span className="ml-auto font-mono text-sm text-zinc-500">
          {fmt(pos)} / {fmt(duration)}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className="h-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
