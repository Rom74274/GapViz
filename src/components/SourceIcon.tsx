// SourceIcon — logo officiel du provider d'import (Ahrefs, Semrush, SE Ranking).
// Les assets sont dans public/source-logos/ pour pouvoir être chargés à
// la racine du déploiement (GitHub Pages respecte le BASE_URL Vite).

import type { ImportSource } from '@/lib/dataLayer';
import { cn } from '@/lib/utils';

interface SourceBrand {
  src: string;
  label: string;
}

const BASE = import.meta.env.BASE_URL;

const BRANDS: Record<ImportSource, SourceBrand> = {
  ahrefs: { src: `${BASE}source-logos/ahrefs.svg`, label: 'Ahrefs' },
  semrush: { src: `${BASE}source-logos/semrush.svg`, label: 'Semrush' },
  seranking: { src: `${BASE}source-logos/seranking.png`, label: 'SE Ranking' },
};

interface Props {
  source: ImportSource;
  size?: number;
  className?: string;
}

export function SourceIcon({ source, size = 24, className }: Props) {
  const brand = BRANDS[source];
  return (
    <img
      src={brand.src}
      alt={brand.label}
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
