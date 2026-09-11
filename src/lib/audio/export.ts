/**
 * TrackTuner — exportación de audio.
 * WAV 16-bit PCM (síncrono) y MP3 320 kbps (encoder lamejs en cliente, con progreso).
 */

/** Codifica un AudioBuffer intercalado a WAV 16-bit PCM y dispara la descarga. */
export function exportWav(buffer: AudioBuffer, filename = "tracktuner.wav"): void {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;
  const out = new ArrayBuffer(bufferSize);
  const view = new DataView(out);

  const writeString = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1 size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // samples intercalados
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = channels[ch][i];
      s = Math.max(-1, Math.min(1, s));
      const v = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, v, true);
      offset += 2;
    }
  }

  downloadBlob(new Blob([out], { type: "audio/wav" }), filename);
}

/** Convierte un canal Float32 a Int16 (entrada del encoder MP3). */
function toInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Codifica un AudioBuffer a MP3 320 kbps en cliente (lamejs wasm, dynamic import)
 * y dispara la descarga. Reporta progreso por bloques de frames.
 */
export async function exportMp3(
  buffer: AudioBuffer,
  filename = "tracktuner.mp3",
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const channels = Math.min(2, buffer.numberOfChannels);
  const rate = buffer.sampleRate;
  const left = toInt16(buffer.getChannelData(0));
  const right = channels === 2 ? toInt16(buffer.getChannelData(1)) : undefined;

  const enc = new Mp3Encoder(channels, rate, 320);
  const block = 1152; // frames por bloque estándar MPEG-1 Layer III
  const total = Math.max(1, Math.ceil(left.length / block));
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < total; i++) {
    const s = i * block;
    const e = Math.min(s + block, left.length);
    const l = left.subarray(s, e);
    const r = right ? right.subarray(s, e) : undefined;
    const out = enc.encodeBuffer(l, r) as Uint8Array;
    if (out.length > 0) chunks.push(out);
    if (i % 4 === 0) {
      onProgress?.(i / total);
      // cede el hilo cada ~40 bloques para que la UI siga viva
      if (i % 40 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }

  const tail = enc.flush() as Uint8Array;
  if (tail.length > 0) chunks.push(tail);
  onProgress?.(1);

  // fusiona todos los bloques en un único ArrayBuffer (compatible BlobPart)
  const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  downloadBlob(new Blob([merged.buffer], { type: "audio/mpeg" }), filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Formatea una duración en segundos a mm:ss. */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
