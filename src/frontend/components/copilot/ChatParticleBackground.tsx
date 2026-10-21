'use client';

/**
 * ChatParticleBackground — Fondo Animado de Partículas Interactivas (Aether Flow)
 *
 * Adaptado exclusivamente para el modo claro y la colorimetría de Midas (Oro y Marfil).
 * Características técnicas:
 * - HTML5 Canvas transparente con 60 FPS acelerado por GPU (sin librerías pesadas).
 * - Partículas sutiles en tonos dorado / amarillo suave (#D4AF37 / #B8860B).
 * - Conexiones de líneas finas inter-partículas basadas en proximidad.
 * - Reacción suave al cursor mediante fuerza elástica de repulsión.
 * - Densidad acotada adaptativa con ResizeObserver y soporte HiDPI (devicePixelRatio).
 * - Pausa automática cuando la pestaña está oculta (document.hidden).
 * - Respeto estricto a accesibilidad y prefers-reduced-motion.
 * - Totalmente no intrusivo: pointer-events-none, aria-hidden="true".
 */

import React, { useEffect, useRef } from 'react';

export interface ChatParticleBackgroundProps {
  className?: string;
  /** Cantidad máxima de partículas (por defecto 45 para máxima ligereza y fluidez) */
  maxParticles?: number;
  /** Distancia máxima en píxeles para trazar una línea de conexión (por defecto 100) */
  connectionDistance?: number;
  /** Radio de influencia del cursor (por defecto 110) */
  mouseRadius?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  baseAlpha: number;
}

// Paleta de partículas: Tonos dorado / amarillo suave Midas en armonía con el modo claro
const GOLD_COLORS = [
  { r: 212, g: 175, b: 55, alpha: 0.38 },  // #D4AF37 (Oro claro)
  { r: 184, g: 134, b: 11, alpha: 0.32 },  // #B8860B (Oro clásico)
  { r: 228, g: 196, b: 98, alpha: 0.42 },  // Oro suave luminoso
  { r: 196, g: 154, b: 42, alpha: 0.30 },  // Oro medio atenuado
];

export function ChatParticleBackground({
  className = '',
  maxParticles = 45,
  connectionDistance = 100,
  mouseRadius = 110,
}: ChatParticleBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let width = 0;
    let height = 0;

    // Control de interacción del cursor
    const mouse = {
      x: null as number | null,
      y: null as number | null,
    };

    // Verificar preferencia de reducción de movimiento
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Colección de partículas
    let particles: Particle[] = [];

    const createParticles = (w: number, h: number) => {
      // Densidad ajustada proporcionalmente al área del contenedor
      const count = Math.min(maxParticles, Math.max(18, Math.floor((w * h) / 11000)));
      const result: Particle[] = [];

      for (let i = 0; i < count; i++) {
        const colorConfig = GOLD_COLORS[i % GOLD_COLORS.length];
        // Velocidades lentas y sutiles (0.12 a 0.35 px/frame)
        const speed = 0.12 + Math.random() * 0.23;
        const angle = Math.random() * Math.PI * 2;

        result.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1.1 + Math.random() * 0.9, // 1.1px a 2.0px
          color: `rgba(${colorConfig.r}, ${colorConfig.g}, ${colorConfig.b}, ${colorConfig.alpha})`,
          baseAlpha: colorConfig.alpha,
        });
      }

      return result;
    };

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

      width = rect.width;
      height = rect.height;

      if (width === 0 || height === 0) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);

      // Reubicar o inicializar partículas dentro de las nuevas dimensiones
      if (particles.length === 0) {
        particles = createParticles(width, height);
      } else {
        particles.forEach((p) => {
          if (p.x > width) p.x = Math.random() * width;
          if (p.y > height) p.y = Math.random() * height;
        });
      }
    };

    updateDimensions();

    // Render loop de animación
    const render = () => {
      if (width === 0 || height === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Fondo estrictamente transparente (sin overlays oscuros)
      ctx.clearRect(0, 0, width, height);

      const maxDistSq = connectionDistance * connectionDistance;
      const mouseDistSq = mouseRadius * mouseRadius;

      // 1. Trazar líneas de conexión entre partículas cercanas
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxDistSq) {
            const distance = Math.sqrt(distSq);
            // Opacidad dinámica inversamente proporcional a la distancia (máximo 0.16)
            const lineAlpha = (1 - distance / connectionDistance) * 0.16;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(212, 175, 55, ${lineAlpha.toFixed(3)})`; // Líneas dorado suave
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      }

      // 2. Actualizar posición, física con cursor y dibujar partículas
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          // Desplazamiento base
          p.x += p.vx;
          p.y += p.vy;

          // Reacción suave al cursor (repulsión elástica)
          if (mouse.x !== null && mouse.y !== null) {
            const mdx = p.x - mouse.x;
            const mdy = p.y - mouse.y;
            const mDistSq = mdx * mdx + mdy * mdy;

            if (mDistSq < mouseDistSq && mDistSq > 0) {
              const mDist = Math.sqrt(mDistSq);
              const force = (1 - mDist / mouseRadius) * 0.45;
              p.x += (mdx / mDist) * force * 1.5;
              p.y += (mdy / mDist) * force * 1.5;
            }
          }

          // Rebote suave en los bordes del contenedor
          if (p.x - p.radius < 0) {
            p.x = p.radius;
            p.vx *= -1;
          } else if (p.x + p.radius > width) {
            p.x = width - p.radius;
            p.vx *= -1;
          }

          if (p.y - p.radius < 0) {
            p.y = p.radius;
            p.vy *= -1;
          } else if (p.y + p.radius > height) {
            p.y = height - p.radius;
            p.vy *= -1;
          }
        }

        // Dibujar partícula
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      // Si el usuario prefiere movimiento reducido, solo dibujamos un frame estático
      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    // Iniciar renderizado
    render();

    // Eventos de cursor sobre el contenedor
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    // Redimensionamiento responsivo mediante ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateDimensions();
        if (prefersReducedMotion) {
          render();
        }
      });
      resizeObserver.observe(container);
    }

    // Pausar animación cuando la pestaña esté oculta para ahorrar CPU
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      } else {
        if (!prefersReducedMotion && animationFrameId === null) {
          animationFrameId = requestAnimationFrame(render);
        }
      }
    };

    container.addEventListener('mousemove', handleMouseMove, { passive: true });
    container.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Limpieza integral al desmontar
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [maxParticles, connectionDistance, mouseRadius]);

  return (
    <div
      ref={containerRef}
      data-testid="chat-particle-background"
      aria-hidden="true"
      role="presentation"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        role="presentation"
        className="block h-full w-full pointer-events-none"
      />
    </div>
  );
}
