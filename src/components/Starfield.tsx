import { useEffect, useRef } from 'react';
import { globalTransformRef } from '@/lib/transformRef';

interface Star {
  x: number; // 0–1 normalisé
  y: number;
  r: number; // 0.5–1.7 px
  baseOpacity: number; // 0.05–0.15
  twinkles: boolean;
  phase: number; // 0–2π
  speed: number; // multiplicateur de période, 0.6–1.4
}

interface Props {
  starCount?: number;
  twinkleCount?: number;
  parallaxFactor?: number; // 0 = aucun, 0.05–0.1 = subtil
}

export function Starfield({
  starCount = 220,
  twinkleCount = 25,
  parallaxFactor = 0.06,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Génère les étoiles une seule fois.
  useEffect(() => {
    const stars: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.5 + Math.random() * 1.2,
        baseOpacity: 0.05 + Math.random() * 0.1,
        twinkles: i < twinkleCount,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.8,
      });
    }
    starsRef.current = stars;
  }, [starCount, twinkleCount]);

  // Resize → met à jour les dimensions du canvas.
  useEffect(() => {
    const update = () => {
      sizeRef.current = { w: window.innerWidth, h: window.innerHeight };
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Render loop.
  useEffect(() => {
    let raf: number | null = null;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.style.width = `${w}px`;
      }
      if (canvas.height !== h * dpr) {
        canvas.height = h * dpr;
        canvas.style.height = `${h}px`;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const t = globalTransformRef.current;
      const offsetX = t.x * parallaxFactor;
      const offsetY = t.y * parallaxFactor;
      const now = performance.now();

      for (const star of starsRef.current) {
        const sx = mod(star.x * w + offsetX, w);
        const sy = mod(star.y * h + offsetY, h);
        let opacity = star.baseOpacity;
        if (star.twinkles) {
          // Oscille entre 30% et 100% de l'opacité de base, période ~3–7 sec.
          const t01 = 0.5 + 0.5 * Math.sin(now / (3000 * star.speed) + star.phase);
          opacity = star.baseOpacity * (0.3 + 0.7 * t01);
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [parallaxFactor]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 block"
    />
  );
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}
