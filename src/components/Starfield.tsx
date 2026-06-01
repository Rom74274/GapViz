import { useEffect, useMemo, useRef } from 'react';

// ---------------------------------------------------------------------------
// Starfield ambiant — 3 couches de profondeur avec parallax souris + drift
// individuel par étoile. Inspiré moment.com : mouvement organique, lent,
// jamais uniforme.
// ---------------------------------------------------------------------------

interface Star {
  x: number; // 0–100 (%)
  y: number; // 0–100 (%)
  size: number; // px
  baseOpacity: number;
  twinkles: boolean;
  twinkleDuration: number; // sec
  twinkleDelay: number; // sec
  // Drift individuel — chaque étoile dérive lentement dans sa propre direction.
  driftX: number; // px amplitude
  driftY: number; // px amplitude
  driftDuration: number; // sec (40–120, très lent)
  driftDelay: number; // sec
}

interface Layer {
  parallax: number; // multiplicateur souris (0 = fixe, 1 = 1:1)
  stars: Star[];
}

interface Props {
  starCount?: number;
}

// Répartition par couche : 60% far, 30% mid, 10% near.
const LAYER_CONFIG = [
  { ratio: 0.6, parallax: 0.008, sizeRange: [0.4, 1.0], opRange: [0.12, 0.28], twinkleRatio: 0.1 },
  { ratio: 0.3, parallax: 0.02, sizeRange: [0.8, 1.6], opRange: [0.2, 0.45], twinkleRatio: 0.15 },
  { ratio: 0.1, parallax: 0.045, sizeRange: [1.2, 2.6], opRange: [0.35, 0.65], twinkleRatio: 0.3 },
] as const;

function buildLayers(total: number): Layer[] {
  return LAYER_CONFIG.map((cfg) => {
    const count = Math.round(total * cfg.ratio);
    const stars: Star[] = [];
    for (let i = 0; i < count; i++) {
      const twinkles = i < count * cfg.twinkleRatio;
      stars.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]),
        baseOpacity: cfg.opRange[0] + Math.random() * (cfg.opRange[1] - cfg.opRange[0]),
        twinkles,
        twinkleDuration: 3 + Math.random() * 5,
        twinkleDelay: Math.random() * 6,
        // Drift : amplitude faible (4–18px), durée longue (40–120s), directions variées.
        driftX: (Math.random() - 0.5) * 2 * (4 + Math.random() * 14),
        driftY: (Math.random() - 0.5) * 2 * (4 + Math.random() * 14),
        driftDuration: 40 + Math.random() * 80,
        driftDelay: Math.random() * -60, // négatif = démarre à un point aléatoire du cycle
      });
    }
    return { parallax: cfg.parallax, stars };
  });
}

export function Starfield({ starCount = 420 }: Props) {
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 }); // position normalisée (-0.5 à 0.5)
  const smoothRef = useRef({ x: 0, y: 0 }); // position lerpée

  const layers = useMemo(() => buildLayers(starCount), [starCount]);

  // Parallax au mouvement de souris — lerp fluide sur chaque frame.
  useEffect(() => {
    let raf: number | null = null;
    let cancelled = false;

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5),
        y: (e.clientY / window.innerHeight - 0.5),
      };
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const tick = () => {
      if (cancelled) return;
      // Lerp — 3% par frame pour un mouvement doux (≈ 60fps → ~0.97^60 par sec).
      const lerp = 0.03;
      smoothRef.current.x += (mouseRef.current.x - smoothRef.current.x) * lerp;
      smoothRef.current.y += (mouseRef.current.y - smoothRef.current.y) * lerp;

      const sx = smoothRef.current.x;
      const sy = smoothRef.current.y;

      for (let i = 0; i < layers.length; i++) {
        const el = layerRefs.current[i];
        if (!el) continue;
        const p = layers[i]!.parallax;
        const tx = sx * p * window.innerWidth;
        const ty = sy * p * window.innerHeight;
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [layers]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none"
      style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}
    >
      {layers.map((layer, li) => (
        <div
          key={li}
          ref={(el) => { layerRefs.current[li] = el; }}
          style={{ position: 'absolute', inset: '-6%', willChange: 'transform' }}
        >
          {layer.stars.map((s, si) => (
            <StarSpan key={si} star={s} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Composant memoïsé — les étoiles ne re-render jamais (props stables).
import { memo } from 'react';

const StarSpan = memo(function StarSpan({ star: s }: { star: Star }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${s.x}%`,
    top: `${s.y}%`,
    width: `${s.size * 2}px`,
    height: `${s.size * 2}px`,
    borderRadius: '50%',
    backgroundColor: 'white',
    // Drift individuel via animation CSS inline (chaque étoile a sa
    // propre direction + vitesse). alternate = va-et-vient fluide.
    animation: `starDrift ${s.driftDuration}s ease-in-out ${s.driftDelay}s infinite alternate`,
    // Les custom properties pilotent le drift dans les keyframes.
    '--drift-x': `${s.driftX}px`,
    '--drift-y': `${s.driftY}px`,
  } as React.CSSProperties;

  if (s.twinkles) {
    // L'animation combine drift + twinkle via une 2e animation.
    style.animation = [
      `starDrift ${s.driftDuration}s ease-in-out ${s.driftDelay}s infinite alternate`,
      `starTwinkle ${s.twinkleDuration}s ease-in-out ${s.twinkleDelay}s infinite`,
    ].join(', ');
    (style as Record<string, string | number>)['--star-op'] = String(s.baseOpacity);
  } else {
    style.opacity = s.baseOpacity;
  }

  return <span style={style} />;
});
