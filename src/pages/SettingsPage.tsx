import { useState } from 'react';
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react';
import { useSettings } from '@/lib/store';

export function SettingsPage() {
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const model = useSettings((s) => s.model);
  const setModel = useSettings((s) => s.setModel);

  const [draft, setDraft] = useState(apiKey ?? '');
  const [reveal, setReveal] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = () => {
    setApiKey(draft.trim() || null);
    setSavedAt(Date.now());
  };

  const clear = () => {
    setDraft('');
    setApiKey(null);
    setSavedAt(Date.now());
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>

      <section className="mt-8 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold">Clé API Anthropic (BYOK)</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Ta clé est stockée localement (localStorage) et utilisée pour appeler Claude
            directement depuis ton navigateur. Elle ne transite par aucun serveur tiers.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={reveal ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 pr-10 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-primary"
              aria-label={reveal ? 'Masquer' : 'Afficher'}
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Save size={14} />
            Enregistrer
          </button>
          {apiKey && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary"
            >
              <Trash2 size={14} />
              Effacer
            </button>
          )}
        </div>

        {savedAt && (
          <p className="text-xs text-text-muted">Enregistré.</p>
        )}
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold">Modèle de clustering</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Sonnet 4.6 recommandé pour le naming des clusters. Haiku si tu veux économiser.
          </p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
        >
          <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recommandé)</option>
          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
          <option value="claude-opus-4-7">claude-opus-4-7</option>
        </select>
      </section>
    </div>
  );
}
