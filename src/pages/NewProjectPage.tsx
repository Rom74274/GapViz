import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';
import { SiteCard, type SiteEntry, labelFromDomain } from '@/components/onboarding/SiteCard';
import { db } from '@/lib/db';
import { MY_SITE_COLOR, pickNextColor } from '@/lib/colors';

function newSite(isMe: boolean, color: string): SiteEntry {
  return {
    id: crypto.randomUUID(),
    domain: '',
    label: '',
    color,
    isMe,
    csvFileName: null,
    parseResult: null,
  };
}

export function NewProjectPage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [myDomain, setMyDomain] = useState('');
  const [country, setCountry] = useState('FR');

  const [mySite, setMySite] = useState<SiteEntry>(() => newSite(true, MY_SITE_COLOR));
  const [competitors, setCompetitors] = useState<SiteEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const usedColors = useMemo(
    () => [mySite.color, ...competitors.map((c) => c.color)],
    [mySite.color, competitors],
  );

  const totalKeywords =
    (mySite.parseResult?.rows.length ?? 0) +
    competitors.reduce((sum, c) => sum + (c.parseResult?.rows.length ?? 0), 0);

  const canSubmit =
    name.trim().length > 0 &&
    myDomain.trim().length > 0 &&
    !submitting;

  const onMyDomainChange = (v: string) => {
    setMyDomain(v);
    if (mySite.domain === '' || mySite.domain === myDomain) {
      setMySite((s) => ({
        ...s,
        domain: v,
        label: s.label === '' || s.label === labelFromDomain(s.domain) ? labelFromDomain(v) : s.label,
      }));
    }
  };

  const addCompetitor = () => {
    const color = pickNextColor(usedColors);
    setCompetitors((cs) => [...cs, newSite(false, color)]);
  };

  const updateMySite = (patch: Partial<SiteEntry>) => {
    setMySite((s) => ({ ...s, ...patch }));
    if (patch.domain !== undefined) setMyDomain(patch.domain);
  };

  const updateCompetitor = (id: string, patch: Partial<SiteEntry>) => {
    setCompetitors((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeCompetitor = (id: string) => {
    setCompetitors((cs) => cs.filter((c) => c.id !== id));
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const projectId = crypto.randomUUID();
    const now = Date.now();

    try {
      await db.transaction('rw', [db.projects, db.competitors, db.keywords], async () => {
        await db.projects.add({
          id: projectId,
          name: name.trim(),
          myDomain: myDomain.trim(),
          country: country.trim().toUpperCase(),
          createdAt: now,
          updatedAt: now,
        });

        const allSites = [mySite, ...competitors].filter((s) => s.domain.trim() !== '');

        for (const site of allSites) {
          const competitorId = crypto.randomUUID();
          await db.competitors.add({
            id: competitorId,
            projectId,
            domain: site.domain.trim(),
            label: site.label.trim() || labelFromDomain(site.domain),
            color: site.color,
            isMe: site.isMe,
          });

          if (site.parseResult && site.parseResult.rows.length > 0) {
            const keywords = site.parseResult.rows.map((row) => ({
              id: crypto.randomUUID(),
              projectId,
              keyword: row.keyword,
              volume: row.volume,
              kd: row.kd,
              cpc: row.cpc,
              intent: row.intent,
              clusterId: null,
              sourceDomain: site.domain.trim(),
              position: row.position,
              url: row.url,
              traffic: row.traffic ?? null,
              serpFeatures: row.serpFeatures ?? null,
              branded: row.branded ?? null,
            }));
            await db.keywords.bulkAdd(keywords);
          }
        }
      });

      navigate(`/projects/${projectId}`);
    } catch (err) {
      setSubmitting(false);
      console.error(err);
      alert(
        'Erreur lors de la sauvegarde : ' +
          (err instanceof Error ? err.message : 'inconnue'),
      );
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau projet</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Définis ton site, ajoute tes concurrents, importe les CSVs. L'analyse est lancée à la fin.
        </p>
      </header>

      <section className="rounded-lg border border-border-subtle bg-bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Informations</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Nom du projet</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Skello FR"
                className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Mon domaine principal</span>
              <input
                type="text"
                value={myDomain}
                onChange={(e) => onMyDomainChange(e.target.value)}
                placeholder="skello.io"
                className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Pays</span>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value.slice(0, 2).toUpperCase())}
                placeholder="FR"
                maxLength={2}
                className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Mon site</h2>
        <SiteCard
          site={mySite}
          onChange={updateMySite}
          disabledColors={usedColors.filter((c) => c !== mySite.color)}
        />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Concurrents{' '}
            <span className="text-text-muted font-normal">({competitors.length})</span>
          </h2>
          <button
            type="button"
            onClick={addCompetitor}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs hover:border-border-strong"
          >
            <Plus size={14} />
            Ajouter un concurrent
          </button>
        </div>

        {competitors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-sm text-text-muted">
            Aucun concurrent pour l'instant.
          </div>
        ) : (
          <div className="space-y-3">
            {competitors.map((c) => (
              <SiteCard
                key={c.id}
                site={c}
                onChange={(patch) => updateCompetitor(c.id, patch)}
                onRemove={() => removeCompetitor(c.id)}
                disabledColors={usedColors.filter((color) => color !== c.color)}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-8 flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-xs text-text-secondary">
          {totalKeywords > 0 ? (
            <>
              <span className="font-mono text-text-primary">{totalKeywords}</span> mots-clés au total,
              répartis sur{' '}
              <span className="font-mono text-text-primary">
                {1 + competitors.length}
              </span>{' '}
              site{competitors.length > 0 ? 's' : ''}.
            </>
          ) : (
            'Aucun CSV importé pour l\'instant.'
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated disabled:text-text-muted"
        >
          <Sparkles size={16} />
          {submitting ? 'Sauvegarde…' : 'Lancer l\'analyse'}
        </button>
      </footer>
    </div>
  );
}
