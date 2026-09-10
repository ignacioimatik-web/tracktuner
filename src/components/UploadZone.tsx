"use client";

import { useCallback, useRef, useState } from "react";

export function UploadZone({ onFile, processing }: { onFile: (f: File) => void; processing: boolean }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
        drag ? "border-teal-500 bg-teal-50 dark:bg-teal-950/20" : "border-zinc-300 bg-zinc-50 hover:border-teal-400 dark:border-zinc-700 dark:bg-zinc-900/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-3xl text-teal-600 dark:bg-teal-900/40 dark:text-teal-300">
        {processing ? (
          <span className="animate-spin text-xl">◌</span>
        ) : (
          <span>🎵</span>
        )}
      </div>
      <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
        {processing ? "Procesando..." : "Suelta tu pista de Suno aquí"}
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        o haz clic para seleccionar · MP3, WAV, M4A · todo local en tu navegador
      </p>
    </div>
  );
}
