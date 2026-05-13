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
  starCount = 500,
  twinkleCount = 60,
  parallaxFactor = 0.06,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const firstDrawRef = useRef(false);

  // Génère les étoiles une seule fois.
  useEffect(() => {
    const stars: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.8 + Math.random() * 2.0, // 0.8 à 2.8 px
        baseOpacity: 0.25 + Math.random() * 0.4, // 25–65 % blanc — clairement visible
        twinkles: i < twinkleCount,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.8,
      });
    }
    starsRef.current = stars;
    firstDrawRef.current = false;
    console.log(`[Starfield] mounted with ${stars.length} stars (${twinkleCount} twinkle)`);
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
          const t01 = 0.5 + 0.5 * Math.sin(now / (3000 * star.speed) + star.phase);
          opacity = star.baseOpacity * (0.3 + 0.7 * t01);
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (!firstDrawRef.current) {
        firstDrawRef.current = true;
        const first = starsRef.current[0];
        console.log(
          `[Starfield] first draw @ ${w}×${h} dpr=${dpr} firstStar=`,
          first ? `(${(first.x * w).toFixed(0)}, ${(first.y * h).toFixed(0)}) r=${first.r.toFixed(1)} op=${first.baseOpacity.toFixed(2)}` : 'none',
        );
      }
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
      className="pointer-events-none"
      style={{
        // Inline styles en fallback au cas où les classes Tailwind manquent.
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}
