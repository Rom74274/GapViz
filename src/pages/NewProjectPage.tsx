import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { SiteCard, type SiteEntry, labelFromDomain } from '@/components/onboarding/SiteCard';
import { MY_SITE_COLOR, pickNextColor } from '@/lib/colors';
import {
  createProjectInSupabase,
  useSupabaseProjects,
  type CreateProjectProgress,
} from '@/lib/dataLayer';
import { useAuth } from '@/hooks/useAuth';
import {
  checkMaxProjects,
  checkMaxKeywords,
  checkMaxCompetitors,
  PLAN_LIMITS,
  type LimitResult,
} from '@/lib/plans';
import type { UserPlan } from '@/lib/supabaseTypes';
import { UpgradeModal } from '@/components/UpgradeModal';

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
  const { profile } = useAuth();
  const plan: UserPlan = profile?.plan ?? 'free';
  const { projects: remoteProjects, loading: loadingProjects } = useSupabaseProjects();

  const [name, setName] = useState('');
  const [myDomain, setMyDomain] = useState('');
  const [country, setCountry] = useState('FR');

  const [mySite, setMySite] = useState<SiteEntry>(() => newSite(true, MY_SITE_COLOR));
  const [competitors, setCompetitors] = useState<SiteEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<CreateProjectProgress | null>(
    null,
  );
  const [upgradeResult, setUpgradeResult] = useState<LimitResult | null>(null);

  // Limites par plan : pré-calculées pour bandeaux + hints inline.
  const projectLimitCheck = useMemo(
    () => (loadingProjects ? null : checkMaxProjects(plan, remoteProjects.length)),
    [plan, remoteProjects.length, loadingProjects],
  );
  const competitorLimit = PLAN_LIMITS[plan].maxCompetitorsPerProject;
  const keywordLimit = PLAN_LIMITS[plan].maxKeywordsPerProject;
  const atProjectLimit = projectLimitCheck !== null && !projectLimitCheck.allowed;

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
    const check = checkMaxCompetitors(plan, competitors.length);
    if (!check.allowed) {
      setUpgradeResult(check);
      return;
    }
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

    // Re-check les limites au submit (état projets peut avoir changé pendant
    // la saisie, et on n'a pas pré-bloqué le total de KWs avant cet instant).
    const projectCheck = checkMaxProjects(plan, remoteProjects.length);
    if (!projectCheck.allowed) {
      setUpgradeResult(projectCheck);
      return;
    }
    const kwCheck = checkMaxKeywords(plan, 0, totalKeywords);
    if (!kwCheck.allowed) {
      setUpgradeResult(kwCheck);
      return;
    }
    // Pour les concurrents, on vérifie que le count saisi ne dépasse pas
    // la limite (peut arriver si l'utilisateur change de plan en cours).
    if (competitorLimit !== null && competitors.length > competitorLimit) {
      setUpgradeResult(checkMaxCompetitors(plan, competitorLimit));
      return;
    }

    setSubmitting(true);

    try {
      const allSites = [mySite, ...competitors].filter((s) => s.domain.trim() !== '');

      // Écriture Supabase first. Le sync write-through Dexie est déclenché
      // automatiquement au mount de ProjectDetailPage (cf. 1e.1).
      const { projectId } = await createProjectInSupabase(
        {
          name: name.trim(),
          myDomain: myDomain.trim(),
          country: country.trim().toUpperCase(),
          sites: allSites.map((s) => ({
            domain: s.domain.trim(),
            label: s.label.trim() || labelFromDomain(s.domain),
            color: s.color,
            isMe: s.isMe,
            parseResult: s.parseResult,
          })),
        },
        (p) => setSubmitProgress(p),
      );

      navigate(`/projects/${projectId}`);
    } catch (err) {
      setSubmitting(false);
      setSubmitProgress(null);
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

      {atProjectLimit && projectLimitCheck && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="flex-1">
            <p className="font-medium text-amber-200">{projectLimitCheck.message}</p>
            <p className="mt-1 text-xs text-amber-200/80">
              Tu peux remplir le formulaire pour t'organiser, mais la création sera bloquée
              tant que tu n'as pas upgradé ou supprimé un projet existant.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeResult(projectLimitCheck)}
            className="rounded-md border border-amber-400/50 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-400/20"
          >
            Voir les plans
          </button>
        </div>
      )}

      <section className="rounded-lg border border-border-subtle bg-bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Informations</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3" data-tour-id="tour-name-input">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Nom du projet</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Mon site FR"
                className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
            </label>
          </div>
          <div className="sm:col-span-2" data-tour-id="tour-domain-input">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">Mon domaine principal</span>
              <input
                type="text"
                value={myDomain}
                onChange={(e) => onMyDomainChange(e.target.value)}
                placeholder="exemple.com"
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

      <section className="mt-6" data-tour-id="tour-my-site">
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
            <span className="text-text-muted font-normal">
              ({competitors.length}
              {competitorLimit !== null && ` / ${competitorLimit}`})
            </span>
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
          {submitting && submitProgress ? (
            <span className="font-mono">
              {progressLabel(submitProgress)}
              {submitProgress.total > 0 && (
                <span className="text-text-muted">
                  {' '}· {submitProgress.done}/{submitProgress.total}
                </span>
              )}
            </span>
          ) : totalKeywords > 0 ? (
            <>
              <span
                className={
                  keywordLimit !== null && totalKeywords > keywordLimit
                    ? 'font-mono text-red-400'
                    : 'font-mono text-text-primary'
                }
              >
                {totalKeywords}
              </span>{' '}
              {keywordLimit !== null && (
                <span className="text-text-muted">/ {keywordLimit.toLocaleString('fr-FR')}</span>
              )}{' '}
              mots-clés, répartis sur{' '}
              <span className="font-mono text-text-primary">
                {1 + competitors.length}
              </span>{' '}
              site{competitors.length > 0 ? 's' : ''}.
              {keywordLimit !== null && totalKeywords > keywordLimit && (
                <span className="ml-1 text-red-400">Au-dessus de la limite de ton plan.</span>
              )}
            </>
          ) : (
            'Aucun CSV importé pour l\'instant.'
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          data-tour-id="tour-submit"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated disabled:text-text-muted"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {submitting ? 'Sauvegarde…' : 'Lancer l\'analyse'}
        </button>
      </footer>

      <UpgradeModal
        open={upgradeResult !== null}
        onClose={() => setUpgradeResult(null)}
        result={upgradeResult}
        currentPlan={plan}
      />
    </div>
  );
}

function progressLabel(p: CreateProjectProgress): string {
  switch (p.step) {
    case 'project':
      return 'Création du projet…';
    case 'competitors':
      return 'Enregistrement des concurrents…';
    case 'keywords':
      return 'Upload des mots-clés';
    case 'positions':
      return 'Upload des positions';
    case 'done':
      return 'Terminé';
  }
}
