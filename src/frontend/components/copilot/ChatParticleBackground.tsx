'use client';

/**
 * ChatParticleBackground ÔÇö Fondo Animado de Part├¡culas Interactivas (Aether Flow)
 *
 * Adaptado exclusivamente para el modo claro y la colorimetr├¡a de Midas (Oro y Marfil).
 * Caracter├¡sticas t├®cnicas:
 * - HTML5 Canvas transparente con 60 FPS acelerado por GPU.
 * - Part├¡culas sutiles pero claramente visibles en tonos dorado / amarillo Midas (#D4AF37 / #B8860B).
 * - Conexiones de l├¡neas finas inter-part├¡culas basadas en proximidad.
 * - Reacci├│n suave al cursor mediante fuerza el├ística de repulsi├│n.
 * - Densidad acotada adaptativa con ResizeObserver y soporte HiDPI (devicePixelRatio).
 * - Pausa autom├ítica cuando la pesta├▒a est├í oculta (document.hidden).
 * - Respeto estricto a accesibilidad y prefers-reduced-motion.
 * - Totalmente no intrusivo: pointer-events-none, aria-hidden="true".
 */

import React, { useEffect, useRef } from 'react';

export interface ChatParticleBackgroundProps {
  className?: string;
  /** Cantidad m├íxima de part├¡culas (por defecto 75 para generar ricas redes de conexi├│n) */
  maxParticles?: number;
  /** Distancia m├íxima en p├¡xeles para trazar una l├¡nea de conexi├│n (por defecto 145) */
  connectionDistance?: number;
  /** Radio de influencia del cursor (por defecto 130) */
  mouseRadius?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

// Paleta de part├¡culas: Tonos dorado / ├ímbar Midas de alta notoriedad y contraste elegante en fondo claro
const GOLD_COLORS = [
  { r: 184, g: 134, b: 11, alpha: 0.95 },  // #B8860B (Oro Midas can├│nico intenso)
  { r: 197, g: 145, b: 12, alpha: 0.92 },  // Oro met├ílico c├ílido
  { r: 217, g: 145, b: 20, alpha: 0.95 },  // ├ümbar dorado brillante
  { r: 175, g: 120, b: 10, alpha: 0.90 },  // Ocre dorado profundo con presencia
];

export function ChatParticleBackground({
  className = '',
  maxParticles = 75,
  connectionDistance = 145,
  mouseRadius = 130,
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
    let cachedLeft = 0;
    let cachedTop = 0;

    // Control de interacci├│n del cursor
    const mouse = {
      x: null as number | null,
      y: null as number | null,
    };

    // Verificar preferencia de reducci├│n de movimiento
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Colecci├│n de part├¡culas
    let particles: Particle[] = [];

    const createParticles = (w: number, h: number) => {
      // Densidad aumentada proporcionalmente al ├írea para generar una rica red de conexiones
      const count = Math.min(maxParticles, Math.max(35, Math.floor((w * h) / 7200)));
      const result: Particle[] = [];

      for (let i = 0; i < count; i++) {
        const colorConfig = GOLD_COLORS[i % GOLD_COLORS.length];
        // Velocidades lentas y constantes (0.16 a 0.40 px/frame)
        const speed = 0.16 + Math.random() * 0.24;
        const angle = Math.random() * Math.PI * 2;

        result.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2.0 + Math.random() * 2.2, // 2.0px a 4.2px (m├ís grandes y notorias)
          color: `rgba(${colorConfig.r}, ${colorConfig.g}, ${colorConfig.b}, ${colorConfig.alpha})`,
        });
      }

      return result;
    };

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      cachedLeft = rect.left;
      cachedTop = rect.top;
      const parentRect = container.parentElement?.getBoundingClientRect();

      const newWidth = Math.floor(rect.width || parentRect?.width || container.clientWidth || 0);
      const newHeight = Math.floor(rect.height || parentRect?.height || container.clientHeight || 0);

      if (newWidth === 0 || newHeight === 0) return;

      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

      width = newWidth;
      height = newHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.scale(dpr, dpr);

      // Reubicar o inicializar part├¡culas dentro de las nuevas dimensiones
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

    // Render loop de animaci├│n
    const render = () => {
      if (width === 0 || height === 0) {
        updateDimensions();
        if (width === 0 || height === 0) {
          animationFrameId = requestAnimationFrame(render);
          return;
        }
      }

      // Fondo estrictamente transparente (sin overlays oscuros)
      ctx.clearRect(0, 0, width, height);

      const maxDistSq = connectionDistance * connectionDistance;
      const mouseDistSq = mouseRadius * mouseRadius;

      // 1. Trazar l├¡neas de conexi├│n entre part├¡culas cercanas
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxDistSq) {
            const distance = Math.sqrt(distSq);
            // Opacidad aumentada y bien notoria en fondo claro (hasta 0.55)
            const lineAlpha = (1 - distance / connectionDistance) * 0.55;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(184, 134, 11, ${lineAlpha.toFixed(3)})`; // L├¡neas doradas visibles
            ctx.lineWidth = 1.3;
            ctx.stroke();
          }
        }
      }

      // 2. Actualizar posici├│n, f├¡sica con cursor y dibujar part├¡culas
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          // Desplazamiento base
          p.x += p.vx;
          p.y += p.vy;

          // Reacci├│n activa y r├ípida al cursor (repulsi├│n el├ística + aceleraci├│n din├ímica)
          if (mouse.x !== null && mouse.y !== null) {
            const mdx = p.x - mouse.x;
            const mdy = p.y - mouse.y;
            const mDistSq = mdx * mdx + mdy * mdy;

            if (mDistSq < mouseDistSq && mDistSq > 0) {
              const mDist = Math.sqrt(mDistSq);
              const force = (1 - mDist / mouseRadius);
              // Desplazamiento din├ímico acelerado
              p.x += (mdx / mDist) * force * 3.8;
              p.y += (mdy / mDist) * force * 3.8;
              // Impulso de velocidad para que se muevan visiblemente m├ís r├ípido al paso del cursor
              p.vx += (mdx / mDist) * force * 0.85;
              p.vy += (mdy / mDist) * force * 0.85;
            }
          }

          // Amortiguaci├│n gradual para regresar suavemente a la velocidad de crucero
          const currentSpeed = Math.hypot(p.vx, p.vy);
          if (currentSpeed > 3.8) {
            p.vx = (p.vx / currentSpeed) * 3.8;
            p.vy = (p.vy / currentSpeed) * 3.8;
          } else if (currentSpeed > 0.42) {
            p.vx *= 0.955;
            p.vy *= 0.955;
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

        // Dibujar part├¡cula dorada m├ís notoria con halo sutil
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        if (p.radius > 2.8) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius + 1.2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(217, 145, 20, 0.35)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // Si el usuario prefiere movimiento reducido, solo dibujamos un frame est├ítico
      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    // Iniciar renderizado
    render();

    // Eventos de cursor
    const handleMouseEnter = () => {
      const rect = container.getBoundingClientRect();
      cachedLeft = rect.left;
      cachedTop = rect.top;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX - cachedLeft;
      mouse.y = e.clientY - cachedTop;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    // Redimensionamiento responsivo mediante ResizeObserver sobre el contenedor y la ventana
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateDimensions();
        if (prefersReducedMotion) {
          render();
        }
      });
      resizeObserver.observe(container);
      if (container.parentElement) {
        resizeObserver.observe(container.parentElement);
      }
    }

    const handleWindowResize = () => {
      updateDimensions();
    };
    window.addEventListener('resize', handleWindowResize, { passive: true });

    // Pausar animaci├│n cuando la pesta├▒a est├® oculta para ahorrar CPU
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

    // Capturar mouse tanto en el contenedor como a nivel de ventana para mayor fluidez
    container.addEventListener('mouseenter', handleMouseEnter, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
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
      window.removeEventListener('resize', handleWindowResize);
      container.removeEventListener('mouseenter', handleMouseEnter);
      window.removeEventListener('mousemove', handleMouseMove);
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
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        role="presentation"
        className="pointer-events-none block h-full w-full"
      />
    </div>
  );
}
