'use client';

import { useNexusStore } from "@/stores/nexus-store";
import { useEffect, useRef } from "react";

export default function BackgroundEffects({
  enabled,
}: {
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useNexusStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled) return;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.2,
      });
    }

    const animate = () => {
      const light = theme === "light";
      ctx.fillStyle = light
        ? "rgba(244, 247, 255, 0.16)"
        : "rgba(6, 7, 18, 0.13)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = light
        ? "rgba(0, 105, 148, 0.075)"
        : "rgba(0, 240, 255, 0.065)";
      ctx.lineWidth = 1;

      for (let x = 0; x < canvas.width; x += 54) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 54) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        const particleColors = light
          ? ["0, 103, 179", "109, 60, 207", "194, 24, 91", "8, 127, 91"]
          : ["0, 240, 255", "192, 76, 255", "255, 45, 149", "0, 255, 136"];
        const color = particleColors[index % particleColors.length];

        ctx.beginPath();
        ctx.arc(
          particle.x,
          particle.y,
          particle.size,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = `rgba(${color}, ${particle.alpha})`;
        ctx.fill();

        for (let nextIndex = index + 1; nextIndex < particles.length; nextIndex++) {
          const next = particles[nextIndex];
          const distance = Math.sqrt(
            (particle.x - next.x) ** 2 + (particle.y - next.y) ** 2,
          );
          if (distance < 100) {
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(next.x, next.y);
            ctx.strokeStyle = `rgba(${color}, ${0.11 * (1 - distance / 100)})`;
            ctx.stroke();
          }
        }
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [enabled, theme]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-75"
    />
  );
}
