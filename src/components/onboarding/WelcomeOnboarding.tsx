import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  FolderPlus,
  FileSpreadsheet,
  Network,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CsvSource = 'ahrefs' | 'semrush' | 'gsc';

const CSV_SOURCES: Array<{ id: CsvSource; label: string }> = [
  { id: 'ahrefs', label: 'Ahrefs' },
  { id: 'semrush', label: 'Semrush' },
  { id: 'gsc', label: 'Google Search Console' },
];

const CSV_INSTRUCTIONS: Record<CsvSource, { steps: string[]; note?: string }> = {
  ahrefs: {
    steps: [
      'Ouvre Site Explorer → entre le domaine de ton site',
      'Va dans Organic Keywords (menu gauche)',
      'Clique Export → CSV',
      'Répète pour chaque concurrent',
    ],
    note: 'Colonnes détectées automatiquement : Keyword, Volume, Position, KD, CPC, URL, Intent, Traffic.',
  },
  semrush: {
    steps: [
      'Ouvre Domain Analytics → Organic Research',
      'Entre le domaine',
      'Onglet Positions → Export → CSV',
      'Répète pour chaque concurrent',
    ],
    note: 'Colonnes détectées automatiquement : Keyword, Volume, Position, KD, CPC, URL, Intent, Traffic.',
  },
  gsc: {
    steps: [
      'Ouvre Google Search Console → Performance',
      'Sélectionne la période souhaitée',
      'Clique Exporter → CSV ou Google Sheets',
      "Fonctionne pour ton site uniquement (pas les concurrents)",
    ],
    note: 'Colonnes supportées : Query (= keyword), Clicks, Impressions, CTR, Position.',
  },
};

export function WelcomeOnboarding() {
  const [csvSource, setCsvSource] = useState<CsvSource>('ahrefs');

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-border-subtle bg-bg-surface/80 p-8 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Bienvenue sur Star Gap</h2>
            <p className="text-sm text-text-secondary">3 étapes pour ta première analyse SEO</p>
          </div>
        </div>

        <ol className="mt-8 space-y-6">
          {/* Step 1 */}
          <li className="flex gap-4">
            <StepNumber n={1} icon={<FolderPlus size={14} />} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary">Crée un projet</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Donne un nom, renseigne ton domaine principal et le pays ciblé.
                Ajoute tes concurrents directs (les sites qui se battent sur les mêmes mots-clés).
              </p>
            </div>
          </li>

          {/* Step 2 */}
          <li className="flex gap-4">
            <StepNumber n={2} icon={<FileSpreadsheet size={14} />} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary">Importe tes CSVs</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Exporte les mots-clés organiques depuis ton outil SEO favori et
                glisse les fichiers dans Star Gap. Un CSV par site (le tien + chaque concurrent).
              </p>

              {/* Source tabs */}
              <div className="mt-3 rounded-lg border border-border-subtle bg-bg-base/60 p-3">
                <div className="flex gap-1 border-b border-border-subtle/50 pb-2">
                  {CSV_SOURCES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCsvSource(s.id)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                        csvSource === s.id
                          ? 'bg-bg-elevated text-text-primary'
                          : 'text-text-muted hover:text-text-secondary',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <ol className="mt-2.5 space-y-1.5">
                  {CSV_INSTRUCTIONS[csvSource].steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-[9px] font-semibold text-text-muted">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                {CSV_INSTRUCTIONS[csvSource].note && (
                  <p className="mt-2.5 text-[10px] text-text-muted">
                    {CSV_INSTRUCTIONS[csvSource].note}
                  </p>
                )}
              </div>
            </div>
          </li>

          {/* Step 3 */}
          <li className="flex gap-4">
            <StepNumber n={3} icon={<Network size={14} />} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary">Lance le clustering</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Claude analyse tes mots-clés et les regroupe en clusters thématiques.
                Tu visualises le résultat sur un graph interactif avec tes gaps SEO mis en évidence.
              </p>
            </div>
          </li>
        </ol>

        <div className="mt-8 flex justify-center">
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover"
          >
            Créer mon premier projet
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function StepNumber({ n, icon }: { n: number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        {icon}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
        Étape {n}
      </span>
    </div>
  );
}
