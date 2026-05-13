import { useEffect, useMemo, useRef } from 'react';
import { globalTransformRef } from '@/lib/transformRef';

interface Star {
  x: number; // 0–100 (%)
  y: number; // 0–100 (%)
  r: number; // px (rayon)
  opacity: number; // 0.2–0.6
  twinkles: boolean;
  duration: number; // sec (3–8)
  delay: number; // sec (0–5)
}

interface Props {
  starCount?: number;
  twinkleCount?: number;
  parallaxFactor?: number;
}

export function Starfield({
  starCount = 500,
  twinkleCount = 80,
  parallaxFactor = 0.06,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const stars = useMemo<Star[]>(() => {
    const out: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      out.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        r: 0.6 + Math.random() * 1.6,
        opacity: 0.2 + Math.random() * 0.4,
        twinkles: i < twinkleCount,
        duration: 3 + Math.random() * 5,
        delay: Math.random() * 5,
      });
    }
    return out;
  }, [starCount, twinkleCount]);

  // Parallax très léger : on lit la ref globale du transform du graph et on
  // applique un translate sur le wrapper. RAF minimal (1 ligne par frame),
  // c'est l'animation des étoiles qui reste en pur CSS.
  useEffect(() => {
    let raf: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const t = globalTransformRef.current;
      const wrapper = wrapperRef.current;
      if (wrapper) {
        wrapper.style.transform = `translate3d(${t.x * parallaxFactor}px, ${t.y * parallaxFactor}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [parallaxFactor]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          position: 'absolute',
          inset: '-5%', // marge pour ne pas découvrir un bord lors du parallax
        }}
      >
        {stars.map((s, i) => {
          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.r * 2}px`,
            height: `${s.r * 2}px`,
            borderRadius: '50%',
            backgroundColor: 'white',
          };
          if (s.twinkles) {
            // Important : on NE met PAS d'opacity inline ici — l'animation
            // CSS pilote 100% l'opacité via les keyframes. Sinon l'inline
            // override l'animation dans certains browsers.
            style.animationDuration = `${s.duration}s`;
            style.animationDelay = `${s.delay}s`;
            (style as Record<string, string | number>)['--gv-star-op'] = String(s.opacity);
          } else {
            style.opacity = s.opacity;
          }
          return (
            <span
              key={i}
              className={s.twinkles ? 'gv-twinkle' : undefined}
              style={style}
            />
          );
        })}
      </div>
    </div>
  );
}
