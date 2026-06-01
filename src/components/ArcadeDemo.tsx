import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Arcade embed avec contour "sabre laser" :
//   - Souris à gauche → glow rouge (Sith)
//   - Souris à droite → glow bleu (Jedi)
//   - Le glow s'allume comme une lame au mouseenter
//   - Son de sabre laser synthétisé via Web Audio API (pas de fichier)
// ---------------------------------------------------------------------------

const RED = { r: 255, g: 40, b: 40 };
const BLUE = { r: 60, g: 120, b: 255 };

function lerpColor(
  a: typeof RED,
  b: typeof RED,
  t: number,
): string {
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `${r}, ${g}, ${bl}`;
}

export function ArcadeDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [ratio, setRatio] = useState(0.5); // 0 = gauche, 1 = droite
  const audioCtxRef = useRef<AudioContext | null>(null);
  const humRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setRatio(Math.max(0, Math.min(1, x)));
  }, []);

  const onMouseEnter = useCallback(() => {
    setActive(true);
    playIgniteSound();
  }, []);

  const onMouseLeave = useCallback(() => {
    setActive(false);
    stopHum();
  }, []);

  // Cleanup audio context on unmount.
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // --- Web Audio: lightsaber ignite + sustained hum ---

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  function playIgniteSound() {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      // Ignite sweep : fréquence monte rapidement (80 → 180Hz) puis se stabilise.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.4);

      // Noise burst simulé avec un 2e oscillateur aigu.
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(800, now);
      osc2.frequency.exponentialRampToValueAtTime(200, now + 0.2);

      const igniteGain = ctx.createGain();
      igniteGain.gain.setValueAtTime(0.12, now);
      igniteGain.gain.linearRampToValueAtTime(0.06, now + 0.3);
      igniteGain.gain.linearRampToValueAtTime(0, now + 0.5);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.04, now);
      noiseGain.gain.linearRampToValueAtTime(0, now + 0.15);

      osc.connect(igniteGain).connect(ctx.destination);
      osc2.connect(noiseGain).connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
      osc2.start(now);
      osc2.stop(now + 0.2);

      // Sustained hum — démarre après l'ignite, reste tant que hover.
      startHum(ctx, now + 0.3);
    } catch {
      // Audio pas supporté — on ignore silencieusement.
    }
  }

  function startHum(ctx: AudioContext, startTime: number) {
    stopHum();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, startTime);
    // Léger vibrato pour un hum vivant.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5, startTime); // 5Hz vibrato
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(3, startTime); // ±3Hz autour de 120
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.035, startTime + 0.3);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);

    humRef.current = { osc, gain };
  }

  function stopHum() {
    if (humRef.current) {
      try {
        const { osc, gain } = humRef.current;
        const ctx = audioCtxRef.current;
        if (ctx) {
          const now = ctx.currentTime;
          gain.gain.linearRampToValueAtTime(0, now + 0.25);
          osc.stop(now + 0.3);
        }
      } catch {
        // Already stopped.
      }
      humRef.current = null;
    }
  }

  // --- Glow style ---

  const color = lerpColor(RED, BLUE, ratio);
  const glowOpacity = active ? 1 : 0;
  const glowSpread = active ? 1 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="group relative rounded-xl p-[2px]"
      style={{
        background: active
          ? `linear-gradient(${ratio < 0.5 ? '135deg' : '225deg'}, rgba(${color}, 0.7), rgba(${color}, 0.15) 60%, transparent)`
          : 'rgba(255,255,255,0.06)',
        transition: 'background 0.5s ease',
      }}
    >
      {/* Glow externe (box-shadow ne peut pas être gradient, donc on le
          fait avec un pseudo-élément absolu flouté). */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-xl"
        style={{
          background: `radial-gradient(ellipse at ${ratio * 100}% 50%, rgba(${color}, ${0.4 * glowOpacity}), transparent 70%)`,
          filter: `blur(${16 * glowSpread}px)`,
          opacity: glowOpacity,
          transition: 'opacity 0.5s ease, filter 0.4s ease, background 0.3s ease',
        }}
      />

      {/* Container iframe avec fond sombre */}
      <div className="relative overflow-hidden rounded-[10px] bg-[#0a0a1a]">
        <div style={{ position: 'relative', paddingBottom: 'calc(60.6397% + 41px)', height: 0, width: '100%' }}>
          <iframe
            src="https://demo.arcade.software/t4LfqXwst9sXvTZx6SSq?embed&embed_mobile=tab&embed_desktop=inline&show_copy_link=true"
            title="Créer un nouveau projet SEO"
            frameBorder="0"
            loading="lazy"
            allowFullScreen
            allow="clipboard-write"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              colorScheme: 'light',
            }}
          />
        </div>
      </div>

      {/* Reflection subtile en bas */}
      <div
        className="pointer-events-none absolute -bottom-4 left-[10%] right-[10%] h-8 rounded-full"
        style={{
          background: `radial-gradient(ellipse, rgba(${color}, ${0.15 * glowOpacity}), transparent 80%)`,
          filter: 'blur(12px)',
          opacity: glowOpacity,
          transition: 'opacity 0.5s ease, background 0.3s ease',
        }}
      />
    </div>
  );
}
