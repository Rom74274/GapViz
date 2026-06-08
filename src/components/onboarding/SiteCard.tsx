import { Trash2, User, Users } from 'lucide-react';
import { ColorPicker } from './ColorPicker';
import { CSVDropzone } from './CSVDropzone';
import { DomainAutocomplete } from './DomainAutocomplete';
import { KeywordPreviewTable } from './KeywordPreviewTable';
import type { ParseResult } from '@/lib/parsers';

export interface SiteEntry {
  id: string;
  domain: string;
  label: string;
  color: string;
  isMe: boolean;
  csvFileName: string | null;
  parseResult: ParseResult | null;
}

interface SiteCardProps {
  site: SiteEntry;
  onChange: (patch: Partial<SiteEntry>) => void;
  onRemove?: () => void;
  disabledColors: string[];
}

export function SiteCard({ site, onChange, onRemove, disabledColors }: SiteCardProps) {
  return (
    <div
      className="rounded-lg border bg-bg-surface p-4 transition-colors"
      style={{ borderColor: site.color + '40' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: site.color + '22', color: site.color }}
        >
          {site.isMe ? <User size={16} /> : <Users size={16} />}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {site.isMe ? 'Mon site' : 'Concurrent'}
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="text-text-muted hover:text-red-400"
                aria-label="Retirer ce concurrent"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Domaine">
              <DomainAutocomplete
                value={site.domain}
                onChange={(domain) => {
                  onChange({
                    domain,
                    // auto-fill label si vide ou identique au précédent auto-fill
                    label:
                      site.label === '' || site.label === labelFromDomain(site.domain)
                        ? labelFromDomain(domain)
                        : site.label,
                  });
                }}
                placeholder="exemple.fr"
              />
            </Field>
            <Field label="Label">
              <input
                type="text"
                value={site.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="Nom affiché"
                className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Couleur">
            <ColorPicker
              value={site.color}
              onChange={(color) => onChange({ color })}
              disabled={disabledColors}
            />
          </Field>

          <Field label="Export Ahrefs / SEMrush / GSC (optionnel)">
            <CSVDropzone
              fileName={site.csvFileName}
              result={site.parseResult}
              onParsed={(csvFileName, parseResult) =>
                onChange({ csvFileName, parseResult })
              }
              onClear={() => onChange({ csvFileName: null, parseResult: null })}
            />
          </Field>

          {site.parseResult && site.parseResult.rows.length > 0 && (
            <KeywordPreviewTable rows={site.parseResult.rows} />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function labelFromDomain(domain: string): string {
  if (!domain) return '';
  const sanitized = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const root = sanitized.split('.')[0] ?? '';
  return root.charAt(0).toUpperCase() + root.slice(1);
}
