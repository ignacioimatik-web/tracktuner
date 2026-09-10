"use client";

import { useTrackProcessor } from "../hooks/useTrackProcessor";
import { UploadZone } from "../components/UploadZone";
import { DiagnosticPanel } from "../components/DiagnosticPanel";
import { MetricsPanel } from "../components/MetricsPanel";
import { Player } from "../components/Player";

export default function Home() {
  const { state, processing, error, loadFile, fixTrack, download, reset } = useTrackProcessor();

  const handleFile = (f: File) => {
    loadFile(f);
  };

  const handleFix = async () => {
    await fixTrack();
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-lg text-white">🎚️</span>
            <span className="text-xl font-bold tracking-tight">TrackTuner</span>
          </div>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Arregla masters de Suno en tu navegador
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
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
          {!state && (
            <UploadZone onFile={handleFile} processing={processing} />
          )}

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              ⚠️ {error}
            </div>
          )}

          {state && !state.fixedBuffer && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{state.fileName}</h2>
                  <p className="text-sm text-zinc-500">
                    {state.analysis.durationSec.toFixed(1)}s · analizado en el navegador
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={reset}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cambiar pista
                  </button>
                  <button
                    onClick={handleFix}
                    disabled={processing}
                    className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    {processing ? "Arreglando..." : "Arreglar automáticamente"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <DiagnosticPanel analysis={state.analysis} />
                <MetricsPanel analysis={state.analysis} />
              </div>
            </div>
          )}

          {state?.fixedBuffer && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">✓ Pista arreglada</h2>
                  <p className="text-sm text-zinc-500">
                    {state.fileName} · se aplicaron {state.fixers.length} correcciones
                  </p>
                </div>
                <button
                  onClick={() => download()}
                  className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  ⬇ Descargar WAV
                </button>
              </div>

              <Player original={state.audioBuffer} fixed={state.fixedBuffer} />

              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Correcciones aplicadas
                </h3>
                <div className="flex flex-wrap gap-2">
                  {state.fixers.map((f) => (
                    <span
                      key={f.name}
                      className="rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={reset}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Arreglar otra pista
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        TrackTuner · procesado 100% local · tus pistas nunca salen de tu navegador
      </footer>
    </div>
  );
}
