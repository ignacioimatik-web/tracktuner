"use client";

/**
 * Waveform — forma de onda en canvas (picos mono), redimensionable.
 * Se usa para comparar original vs master sin reproducir nada.
 */

import { useEffect, useRef } from "react";

export function Waveform({
  buffer,
  color,
  height = 64,
  className,
}: {
  buffer: AudioBuffer;
  color: string;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const w = canvas.clientWidth || 600;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = w * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, height);

      const data = buffer.getChannelData(0);
      const cols = Math.max(1, Math.floor(w / 2));
      const per = Math.max(1, Math.floor(data.length / cols));
      const mid = height / 2;

      ctx.fillStyle = color;
      for (let c = 0; c < cols; c++) {
        let min = 1;
        let max = -1;
        const s = c * per;
        const e = Math.min(s + per, data.length);
        for (let i = s; i < e; i++) {
          const v = data[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const h1 = Math.max(0.5, Math.abs(max) * mid);
        const h2 = Math.max(0.5, Math.abs(min) * mid);
        ctx.fillRect(c * 2, mid - h1, 1.5, h1 + h2);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [buffer, color, height]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height }} />;
}
