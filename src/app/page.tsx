"use client";

import { useTrackProcessor } from "../hooks/useTrackProcessor";
import { UploadZone } from "../components/UploadZone";
import { DiagnosticPanel } from "../components/DiagnosticPanel";
import { MetricsPanel } from "../components/MetricsPanel";
import { Player } from "../components/Player";
import { FixerCard } from "../components/FixerCard";
import { ChainView } from "../components/ChainView";
import { ConsoleLog } from "../components/ConsoleLog";
import { Waveform } from "../components/Waveform";
import { ProgressOverlay } from "../components/ProgressOverlay";
import { FIXER_META, FIXER_ORDER } from "../lib/audio/fixers";

export default function Home() {
  const {
    state,
    processing,
    analyzing,
    analysisProgress,
    mastering,
    chainProgress,
    mp3Progress,
    dirty,
    error,
    messages,
    loadFile,
    master,
    updateFixer,
    addFixer,
    removeFixer,
    download,
    reset,
  } = useTrackProcessor();

  const handleFile = (f: File) => loadFile(f);

  const pendingManual = state
    ? FIXER_ORDER.filter((id) => !state.fixers.some((f) => f.id === id))
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-cream font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <ProgressOverlay progress={analyzing ? analysisProgress : null} />

      <header className="border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-lg text-white">🎚️</span>
            <span className="text-xl font-bold tracking-tight">TrackTuner</span>
          </div>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Arregla masters de Suno en tu navegador
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <section className="mb-10 text-center">
          <h1 className="mx-auto max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Tu pista de <span className="text-teal-600">Suno</span>, sonando como un máster real
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Detecta saturación, clipping, ecualización pobre y problemas de loudness, y los corrige
            automáticamente. Todo local en tu navegador — privado e instantáneo.
          </p>
        </section>

        <div className="space-y-6">
          {!state && <UploadZone onFile={handleFile} processing={processing || analyzing} />}

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              ⚠️ {error}
            </div>
          )}

          {state && (
            <>
              {/* Barra de pista */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{state.fileName}</h2>
                  <p className="text-sm text-zinc-500">
                    {state.analysis.durationSec.toFixed(1)}s · analizado en el navegador
                    {state.elapsedMs !== null && (
                      <span className="text-zinc-400"> · mastering en {(state.elapsedMs / 1000).toFixed(1)}s</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={reset}
                    disabled={mastering}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cambiar pista
                  </button>
                  <button
                    onClick={master}
                    disabled={mastering || processing}
                    className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    {mastering
                      ? "Procesando…"
                      : dirty
                        ? "⚡ Procesar cambios"
                        : state.fixedBuffer
                          ? "🔄 Re-procesar"
                          : "🎚️ Procesar mastering"}
                  </button>
                </div>
              </div>

              {/* Mientras masteriza: telemetría en vivo */}
              {mastering ? (
                <ChainView fixers={state.fixers} chain={state.chain} chainProgress={chainProgress} mastering />
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Columna izquierda: análisis + resultado */}
                  <div className="space-y-6">
                    <DiagnosticPanel analysis={state.fixedAnalysis ?? state.analysis} />
                    <MetricsPanel analysis={state.fixedAnalysis ?? state.analysis} />

                    {state.fixedBuffer && (
                      <div className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Antes vs después
                        </h3>
                        <div>
                          <p className="mb-1 text-[11px] font-medium text-zinc-400">ORIGINAL</p>
                          <Waveform buffer={state.audioBuffer} color="rgba(244,63,94,0.8)" height={56} />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-medium text-teal-500">MASTER</p>
                          <Waveform buffer={state.fixedBuffer} color="rgba(20,184,166,0.9)" height={56} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Columna derecha: cadena editable + consola */}
                  <div className="space-y-4">
                    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Mejoras de la cadena
                        </h3>
                        <span className="text-[11px] text-zinc-400">
                          {state.fixers.filter((f) => f.enabled).length} activas de {state.fixers.length}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {state.fixers.map((f) => (
                          <FixerCard
                            key={f.id}
                            fixer={f}
                            run={state.chain.find((r) => r.fixerId === f.id)}
                            onChange={(patch) => updateFixer(f.id, patch)}
                            onRemove={state.fixers.length > 1 ? () => removeFixer(f.id) : undefined}
                            disabled={mastering}
                          />
                        ))}
                      </div>

                      {pendingManual.length > 0 && (
                        <div className="mt-3">
                          <select
                            value=""
                            onChange={(e) => e.target.value && addFixer(e.target.value)}
                            className="w-full rounded-lg border border-dashed border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-zinc-600 dark:text-zinc-400"
                          >
                            <option value="">＋ Añadir mejora manual…</option>
                            {pendingManual.map((id) => (
                              <option key={id} value={id}>
                                {FIXER_META[id].icon} {FIXER_META[id].label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {dirty && (
                        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          ⚡ Hay cambios sin aplicar — pulsa «Procesar cambios» para re-masterizar.
                        </p>
                      )}
                    </div>

                    <ConsoleLog messages={messages} />
                  </div>
                </div>
              )}

              {/* Resultado: reproducción + descarga */}
              {state.fixedBuffer && !mastering && (
                <div className="space-y-4">
                  {state.chain.length > 0 && (
                    <ChainView fixers={state.fixers} chain={state.chain} chainProgress={null} mastering={false} />
                  )}

                  <Player original={state.audioBuffer} fixed={state.fixedBuffer} />

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => download("wav")}
                      disabled={processing}
                      className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
                    >
                      ⬇ Descargar WAV
                    </button>
                    <button
                      onClick={() => download("mp3")}
                      disabled={processing}
                      className="rounded-lg border border-teal-600 px-6 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 disabled:opacity-50 dark:text-teal-300 dark:hover:bg-teal-900/30"
                    >
                      {mp3Progress !== null
                        ? `Codificando MP3… ${Math.round(mp3Progress * 100)}%`
                        : "⬇ Descargar MP3 320k"}
                    </button>
                    <button
                      onClick={reset}
                      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Arreglar otra pista
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        TrackTuner · procesado 100% local · tus pistas nunca salen de tu navegador
      </footer>
    </div>
  );
}
