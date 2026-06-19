// SourceIcon — logo stylisé pour chaque provider d'import.
// Pas les logos officiels (à remplacer par les vrais SVG si besoin),
// mais un cercle aux couleurs brand avec l'initiale. Lisible, cohérent
// avec le design system, et zéro dépendance externe.

import type { ImportSource } from '@/lib/dataLayer';
import { cn } from '@/lib/utils';

interface SourceBrand {
  letter: string;
  // Gradient en couleurs brand (de chaque provider).
  gradient: string;
  // Couleur du texte (selon contraste avec le bg).
  text: string;
}

const BRANDS: Record<ImportSource, SourceBrand> = {
  ahrefs: {
    letter: 'A',
    gradient: 'linear-gradient(135deg, #0061BD 0%, #0093EE 100%)',
    text: '#ffffff',
  },
  semrush: {
    letter: 'S',
    gradient: 'linear-gradient(135deg, #FF642D 0%, #FF8A65 100%)',
    text: '#ffffff',
  },
  seranking: {
    letter: 'S',
    gradient: 'linear-gradient(135deg, #1B9DEC 0%, #5DC6FF 100%)',
    text: '#ffffff',
  },
};

interface Props {
  source: ImportSource;
  size?: number;
  className?: string;
}

export function SourceIcon({ source, size = 24, className }: Props) {
  const brand = BRANDS[source];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-bold',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: brand.gradient,
        color: brand.text,
        fontSize: Math.round(size * 0.55),
        boxShadow:
          '0 1px 0 0 rgba(255,255,255,0.2) inset, 0 4px 12px -2px rgba(0,0,0,0.3)',
      }}
      aria-label={source}
    >
      {brand.letter}
    </span>
  );
}
