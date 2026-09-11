# TrackTuner 🎚️

Arregla masters de **Suno** en tu navegador: detecta saturación, clipping, ecualización pobre y problemas de loudness, y los corrige con una cadena de mastering paso a paso. **Procesado 100% local** — tus pistas nunca salen de tu navegador.

## Cómo funciona

1. **Sube tu pista** (MP3, WAV, M4A, OGG, FLAC) — se decodifica y analiza al instante: loudness integrada (EBU R128), true peak, ratio de clipping, espectro por bandas y sibilancias.
2. **Revisa el diagnóstico** — problemas con severidad y métricas reales: clipping, true peak alto, loudness alto/bajo, graves embarrados, brillos duros, sonido apagado, de-esser.
3. **Ajusta la cadena de mejoras** — cada fixer tiene su tarjeta: toggle activar/desactivar, slider de intensidad y ventana de información con sus parámetros. Añade mejoras manuales si quieres.
4. **Procesa el mastering** — la cadena se ejecuta **paso a paso con telemetría en tiempo real**: progreso del render, medición del antes→después de cada mejora y consola de procesado en vivo.
5. **Compara y descarga** — A/B original vs master, waveforms lado a lado, y export a **WAV** o **MP3 320k**.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, TypeScript strict
- Web Audio API (OfflineAudioContext) para el render de la cadena
- Vitest para los tests de análisis y fixers
- pnpm 12

## Desarrollo

```bash
pnpm install
pnpm dev       # http://localhost:3000
pnpm test      # tests unitarios
pnpm lint
pnpm build     # build de producción
```

## Arquitectura

```
src/lib/audio/
  analysis.ts      # análisis puro (LUFS, true peak, clipping, espectro, diagnóstico)
  fixers.ts        # registro de mejoras (FIXER_META) + construcción/reconstrucción
  pipeline.ts      # masterTrack(): cadena paso a paso con telemetría real
  export.ts        # WAV 16-bit + MP3 320k (lamejs)
  types.ts         # tipos compartidos
src/hooks/
  useTrackProcessor.ts  # orquestador: carga → análisis → cadena → descarga
src/components/
  FixerCard.tsx    # botón + ventana de info por mejora
  ChainView.tsx    # progreso global y paso a paso de la cadena
  ConsoleLog.tsx   # consola en tiempo real
  Waveform.tsx     # comparación antes/después en canvas
  ...
```

### Cadena de mastering

`masterTrack()` aplica cada fixer **por separado**: renderiza el prefijo de la cadena con
OfflineAudioContext, re-analiza el resultado y mide el delta real de la métrica objetivo.
El progreso del render se obtiene programando `suspend()` en intervalos regulares y leyendo
`currentTime/duration` en cada reanudación.

El paso de **normalización LUFS** calcula la ganancia exacta midiendo el loudness real
antes del paso (`target − medido`), no un ajuste fijo — el master sale a ~-14 LUFS.

## Fase 2 (roadmap)

Procesado pesado por servidor en el **Mac Studio** (tailnet): separación de stems (demucs),
restauración con modelos de IA (denoise/starless U-Net) y mastering neural. TrackTuner pasaría
a tener un modo "Studio" que sube la pista a una API del Studio y recibe el resultado.
