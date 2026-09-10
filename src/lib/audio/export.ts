/**
 * TrackTuner — exportación de audio.
 * Convierte un AudioBuffer renderizado a WAV (16-bit PCM) descargable.
 * MP3 codificado en cliente requeriría un encoder wasm; v1 exporta WAV.
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

  const blob = new Blob([out], { type: "audio/wav" });
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
