import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tour interactif "à la Arcade" — backdrop sombre + spotlight sur l'élément
// cible + tooltip + click pour avancer. Trigger : 1ère venue de l'utilisateur
// (flag localStorage). Survit aux navigations entre pages.
// ---------------------------------------------------------------------------

const LS_KEY = 'stargap-onboarding-completed';

interface Step {
  // null = écran de bienvenue centré, pas de spotlight
  targetId: string | null;
  title: string;
  message: string;
  // 'click' : avance quand l'utilisateur clique sur la cible
  // 'next'  : avance via bouton Suivant
  // 'start' : juste un bouton "Commencer" sur l'écran de bienvenue
  advance: 'click' | 'next' | 'start' | 'finish';
  // Sur quelle route on doit être pour afficher ce step
  expectedPath?: string | RegExp;
  // Position du tooltip relativement à la cible
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const STEPS: Step[] = [
  {
    targetId: 'tour-new-project-btn',
    title: 'Crée ton premier projet',
    message: 'Bienvenue ! Clique ici pour démarrer ton premier projet SEO.',
    advance: 'click',
    expectedPath: '/',
    placement: 'bottom',
  },
  {
    targetId: 'tour-name-input',
    title: 'Étape 2 — Nomme ton projet',
    message: 'Donne un nom évocateur — par exemple le nom de ton site ou ta thématique.',
    advance: 'next',
    expectedPath: /^\/projects\/new/,
    placement: 'bottom',
  },
  {
    targetId: 'tour-domain-input',
    title: 'Étape 3 — Ton domaine',
    message: 'Renseigne le domaine que tu veux analyser (ex: skello.io).',
    advance: 'next',
    expectedPath: /^\/projects\/new/,
    placement: 'bottom',
  },
  {
    targetId: 'tour-my-site',
    title: 'Étape 4 — Importe tes mots-clés',
    message:
      'Glisse ton CSV (Ahrefs, Semrush ou GSC). Les colonnes sont détectées automatiquement.',
    advance: 'next',
    expectedPath: /^\/projects\/new/,
    placement: 'top',
  },
  {
    targetId: 'tour-submit',
    title: 'Étape 5 — Lance l\'analyse',
    message:
      'Clique sur "Lancer l\'analyse" pour créer ton projet. Tu pourras lancer le clustering juste après.',
    advance: 'click',
    expectedPath: /^\/projects\/new/,
    placement: 'top',
  },
  {
    targetId: null,
    title: 'C\'est parti !',
    message:
      'Une fois ton projet créé, tu pourras lancer le clustering IA et explorer le graph de tes gaps SEO.',
    advance: 'finish',
    placement: 'center',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour() {
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // targetRect = position réelle de la cible (snap dès qu'elle change)
  // displayedRect = position affichée (lerpée vers targetRect → animation fluide)
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [displayedRect, setDisplayedRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);
  const lerpRef = useRef<number | null>(null);

  // Au mount : vérifie si on doit lancer le tour.
  useEffect(() => {
    try {
      const done = localStorage.getItem(LS_KEY);
      if (!done) setActive(true);
    } catch {
      // ignore
    }
  }, []);

  const step = STEPS[stepIndex];

  const complete = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, 'true');
    } catch {
      // ignore
    }
    setActive(false);
  }, []);

  const goNext = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) {
      complete();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, complete]);

  // Track la position de l'élément cible. RAF loop pour suivre scroll/resize/
  // animations. Si la cible n'existe pas encore (page pas chargée), on
  // poll jusqu'à ce qu'elle apparaisse.
  useEffect(() => {
    if (!active || !step || !step.targetId) {
      setTargetRect(null);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
        setTargetRect((prev) => {
          if (!prev || prev.top !== next.top || prev.left !== next.left ||
              prev.width !== next.width || prev.height !== next.height) {
            return next;
          }
          return prev;
        });
      } else {
        setTargetRect(null);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, step]);

  // Lerp displayedRect → targetRect pour une transition fluide entre étapes.
  // Lerp factor 0.18 → ~0.2-0.3s de glissement, ressenti naturel.
  useEffect(() => {
    if (!targetRect) {
      setDisplayedRect(null);
      return;
    }
    // Si on n'a pas encore de rect affiché (1er step), snap directement.
    if (!displayedRect) {
      setDisplayedRect(targetRect);
      return;
    }
    let cancelled = false;
    const animate = () => {
      if (cancelled) return;
      setDisplayedRect((prev) => {
        if (!prev) return targetRect;
        const f = 0.18;
        const next: Rect = {
          top: prev.top + (targetRect.top - prev.top) * f,
          left: prev.left + (targetRect.left - prev.left) * f,
          width: prev.width + (targetRect.width - prev.width) * f,
          height: prev.height + (targetRect.height - prev.height) * f,
        };
        // Si très proche, snap pour éviter les microframes infinies.
        const close =
          Math.abs(next.top - targetRect.top) < 0.5 &&
          Math.abs(next.left - targetRect.left) < 0.5 &&
          Math.abs(next.width - targetRect.width) < 0.5 &&
          Math.abs(next.height - targetRect.height) < 0.5;
        if (close) return targetRect;
        return next;
      });
      lerpRef.current = requestAnimationFrame(animate);
    };
    lerpRef.current = requestAnimationFrame(animate);
    return () => {
      cancelled = true;
      if (lerpRef.current !== null) cancelAnimationFrame(lerpRef.current);
    };
  }, [targetRect, displayedRect]);

  // Si le step attend un clic sur la cible, on intercepte le click au capture.
  useEffect(() => {
    if (!active || !step || step.advance !== 'click' || !step.targetId) return;
    const onCapture = (e: MouseEvent) => {
      const el = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) {
        // Laisse le click se propager (la navigation se fait), puis avance.
        setTimeout(() => goNext(), 50);
      }
    };
    document.addEventListener('click', onCapture, { capture: true });
    return () => document.removeEventListener('click', onCapture, { capture: true });
  }, [active, step, goNext]);

  // Vérifie qu'on est sur la bonne route pour le step courant. Si non, on
  // attend simplement — le tooltip restera caché tant qu'on n'a pas la cible.
  const onCorrectPath = !step?.expectedPath || (
    typeof step.expectedPath === 'string'
      ? location.pathname === step.expectedPath
      : step.expectedPath.test(location.pathname)
  );

  if (!active || !step) return null;

  // ----- Rendering -----

  const isFinish = step.advance === 'finish';

  // Modal centré pour le step final uniquement
  if (isFinish) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative max-w-md rounded-2xl border border-accent/30 bg-bg-surface p-8 shadow-2xl">
          <button
            type="button"
            onClick={complete}
            className="absolute right-3 top-3 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Sparkles size={18} />
            </span>
            <h2 className="text-lg font-semibold tracking-tight">{step.title}</h2>
          </div>
          <p className="mt-3 text-sm text-text-secondary">{step.message}</p>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={complete}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Terminer
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pas la bonne route ou cible non trouvée → on cache (le tour reprendra
  // quand la route et la cible matchent).
  if (!onCorrectPath || !displayedRect) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[9999] bg-black/30" />
    );
  }

  // Spotlight + tooltip (utilise displayedRect = position lerpée animée)
  const padding = 8;
  const sx = displayedRect.left - padding;
  const sy = displayedRect.top - padding;
  const sw = displayedRect.width + padding * 2;
  const sh = displayedRect.height + padding * 2;

  // Position du tooltip
  const tooltipPlacement = step.placement ?? 'bottom';
  const tooltipStyle: React.CSSProperties = {};
  if (tooltipPlacement === 'bottom') {
    tooltipStyle.top = sy + sh + 16;
    tooltipStyle.left = Math.max(16, Math.min(window.innerWidth - 360 - 16, sx + sw / 2 - 180));
  } else if (tooltipPlacement === 'top') {
    tooltipStyle.bottom = window.innerHeight - sy + 16;
    tooltipStyle.left = Math.max(16, Math.min(window.innerWidth - 360 - 16, sx + sw / 2 - 180));
  } else if (tooltipPlacement === 'right') {
    tooltipStyle.top = sy;
    tooltipStyle.left = sx + sw + 16;
  } else if (tooltipPlacement === 'left') {
    tooltipStyle.top = sy;
    tooltipStyle.right = window.innerWidth - sx + 16;
  }

  return (
    <>
      {/* Backdrop avec cutout SVG */}
      <svg
        className="pointer-events-none fixed inset-0 z-[9998]"
        width="100%"
        height="100%"
      >
        <defs>
          <mask id="tour-spotlight">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={sx}
              y={sy}
              width={sw}
              height={sh}
              rx={12}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.7)"
          mask="url(#tour-spotlight)"
        />
      </svg>

      {/* Anneau lumineux autour de la cible */}
      <div
        className="pointer-events-none fixed z-[9998] rounded-xl"
        style={{
          top: sy,
          left: sx,
          width: sw,
          height: sh,
          boxShadow: '0 0 0 2px rgba(124, 92, 252, 0.7), 0 0 30px rgba(124, 92, 252, 0.45)',
          animation: 'tourPulse 1.8s ease-in-out infinite',
        }}
      />

      {/* Tooltip */}
      <div
        className={cn(
          'fixed z-[9999] w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-accent/30 bg-bg-surface p-4 shadow-2xl',
        )}
        style={tooltipStyle}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{step.title}</h3>
            <p className="mt-1 text-xs text-text-secondary">{step.message}</p>
          </div>
          <button
            type="button"
            onClick={complete}
            className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Fermer le tour"
          >
            <X size={12} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] text-text-muted">
            {stepIndex} / {STEPS.length - 1}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={complete}
              className="text-[10px] text-text-muted hover:text-text-secondary"
            >
              Passer
            </button>
            {step.advance === 'next' && (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
              >
                Suivant
                <ArrowRight size={11} />
              </button>
            )}
            {step.advance === 'click' && (
              <span className="text-[10px] text-accent">
                ↑ Clique sur l'élément ↑
              </span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(124, 92, 252, 0.7), 0 0 30px rgba(124, 92, 252, 0.45); }
          50% { box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.9), 0 0 50px rgba(124, 92, 252, 0.7); }
        }
      `}</style>
    </>
  );
}
