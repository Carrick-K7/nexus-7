'use client';

import { useEffect, useRef, useCallback } from 'react';

interface MatrixStream {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  charIndex: number;
  length: number;
}

interface MatrixRainProps {
  enabled?: boolean;
  opacity?: number;
}

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%^&*()';
const FONT_SIZE = 16;
const STREAM_COUNT = 80;

export default function MatrixRain({ enabled = true, opacity = 0.8 }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamsRef = useRef<MatrixStream[]>([]);
  const animationRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const initStreams = useCallback((width: number, height: number) => {
    const streams: MatrixStream[] = [];
    const columns = Math.floor(width / FONT_SIZE);

    for (let i = 0; i < STREAM_COUNT; i++) {
      const x = Math.floor(Math.random() * columns) * FONT_SIZE;
      const speed = 2 + Math.random() * 4;
      const length = 5 + Math.floor(Math.random() * 15);

      streams.push({
        x,
        y: Math.random() * height,
        speed,
        chars: Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
        charIndex: 0,
        length,
      });
    }

    streamsRef.current = streams;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const doDraw = () => {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      streamsRef.current.forEach((stream) => {
        for (let j = 0; j < stream.chars.length; j++) {
          const charY = stream.y - j * FONT_SIZE;
          if (charY < 0 || charY > canvas.height) continue;

          const brightness = 1 - (j / stream.length);
          const alpha = brightness * opacity;

          ctx.font = `${FONT_SIZE}px 'JetBrains Mono', monospace`;
          ctx.fillStyle = j === 0
            ? `rgba(255, 255, 255, ${alpha})`
            : `rgba(0, 255, 136, ${alpha})`;
          ctx.shadowColor = '#00ff88';
          ctx.shadowBlur = j === 0 ? 15 : 5;
          ctx.fillText(stream.chars[j], stream.x, charY);
        }

        stream.y += stream.speed;
        if (stream.y - stream.length * FONT_SIZE > canvas.height) {
          stream.y = 0;
          stream.chars = Array.from(
            { length: stream.length },
            () => CHARS[Math.floor(Math.random() * CHARS.length)]
          );
        }

        if (Math.random() > 0.95) {
          const idx = Math.floor(Math.random() * stream.chars.length);
          stream.chars[idx] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      });

      animationRef.current = requestAnimationFrame(doDraw);
    };

    if (enabled) {
      animationRef.current = requestAnimationFrame(doDraw);
    } else {
      clearCanvas();
    }

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [enabled, opacity, clearCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      initStreams(canvas.width, canvas.height);
      if (!enabled) clearCanvas();
    };

    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [enabled, initStreams, clearCanvas]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ opacity }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
