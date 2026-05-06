import { Link } from 'react-router-dom';
import { ArrowRight, Upload, Sparkles, Network } from 'lucide-react';

export function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="space-y-3">
        <span className="inline-block rounded-full border border-border-subtle bg-bg-surface px-3 py-1 text-xs font-mono text-text-secondary">
          V1 — MVP local
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-text-primary">
          Cartographie ton paysage SEO concurrentiel.
        </h1>
        <p className="text-lg text-text-secondary">
          Importe tes exports CSV (Ahrefs, SEMrush, GSC), GapViz cluste tes mots-clés et
          révèle visuellement les territoires que tu partages — ou pas — avec tes concurrents.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Feature icon={Upload} title="Upload CSV" body="Ahrefs, SEMrush, GSC — auto-détecté." />
        <Feature icon={Sparkles} title="Clustering Claude" body="Sonnet 4.6 nomme tes thématiques." />
        <Feature icon={Network} title="MindMap interactive" body="D3 + Canvas. Couleurs par concurrent." />
      </div>

      <div className="mt-10 flex items-center gap-3">
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Créer un projet
          <ArrowRight size={16} />
        </Link>
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          Voir mes projets
        </Link>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          Configurer ma clé API
        </Link>
      </div>

      <p className="mt-8 text-xs text-text-muted">
        BYOK — clé Anthropic stockée localement, jamais transmise à un serveur tiers.
      </p>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Upload;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <Icon className="text-accent" size={20} />
      <h3 className="mt-3 text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{body}</p>
    </div>
  );
}
