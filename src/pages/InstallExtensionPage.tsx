import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Download, Puzzle, ExternalLink } from 'lucide-react';
import { useExtensionInstalled } from '@/lib/extensionInstall';

// URL du ZIP de l'extension à mettre à jour quand on release une nouvelle
// version sideload (avant Chrome Web Store). Le fichier est hébergé sur
// GitHub Releases.
const EXTENSION_ZIP_URL =
  'https://github.com/Rom74274/GapViz/releases/latest/download/star-gap-importer.zip';

export function InstallExtensionPage() {
  const { installed, version } = useExtensionInstalled();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft size={12} />
        Retour
      </Link>

      <div className="mt-6 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Puzzle size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Installer l'extension Star Gap Importer
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Capture les exports Ahrefs en 1 clic et les pousse dans tes projets.
          </p>
        </div>
      </div>

      {installed && (
        <div className="mt-6 flex items-center gap-2 rounded-md border border-green-400/40 bg-green-400/5 px-3 py-2 text-sm text-green-300">
          <Check size={14} />
          Extension détectée (v{version}). Tu peux fermer cet onglet.
        </div>
      )}

      <ol className="mt-8 space-y-6 text-sm">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-medium text-text-primary">
            1
          </span>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Télécharger l'extension</p>
            <p className="mt-1 text-xs text-text-secondary">
              Un fichier ZIP contenant l'extension non-empaquetée.
            </p>
            <a
              href={EXTENSION_ZIP_URL}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20"
            >
              <Download size={11} />
              Télécharger star-gap-importer.zip
            </a>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-medium text-text-primary">
            2
          </span>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Décompresser le ZIP</p>
            <p className="mt-1 text-xs text-text-secondary">
              Range le dossier extrait à un endroit stable (ex : <code className="rounded bg-bg-elevated px-1 py-0.5">~/Extensions/star-gap</code>).
              Si tu le déplaces ou le supprimes, Chrome désactivera l'extension.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-medium text-text-primary">
            3
          </span>
          <div className="flex-1">
            <p className="font-medium text-text-primary">
              Ouvrir <code className="rounded bg-bg-elevated px-1 py-0.5">chrome://extensions</code>
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              Colle l'URL dans la barre d'adresse (Chrome interdit les liens
              cliquables vers <code>chrome://</code>).
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-medium text-text-primary">
            4
          </span>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Activer le mode développeur</p>
            <p className="mt-1 text-xs text-text-secondary">
              Toggle en haut à droite de la page <em>Extensions</em>.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-medium text-text-primary">
            5
          </span>
          <div className="flex-1">
            <p className="font-medium text-text-primary">
              Cliquer <em>« Charger l'extension non empaquetée »</em>
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              Sélectionne le dossier extrait à l'étape 2. L'icône Star Gap
              apparaît dans la barre d'outils.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-medium text-text-primary">
            6
          </span>
          <div className="flex-1">
            <p className="font-medium text-text-primary">Recharger Star Gap</p>
            <p className="mt-1 text-xs text-text-secondary">
              Cette page se mettra à jour automatiquement une fois l'extension
              active.
            </p>
          </div>
        </li>
      </ol>

      <div className="mt-10 rounded-md border border-border-subtle bg-bg-surface/40 p-4">
        <p className="text-xs font-medium text-text-primary">Une fois installée</p>
        <p className="mt-1 text-xs text-text-secondary">
          Va sur un projet, clique{' '}
          <span className="inline-flex items-center gap-1 rounded bg-bg-elevated px-1.5 py-0.5">
            <ExternalLink size={10} /> Ajouter un site
          </span>
          , saisis un domaine et laisse Star Gap ouvrir Ahrefs. Tu n'as qu'à
          cliquer <em>Export → CSV</em> au-dessus de la table — le reste est
          automatique.
        </p>
      </div>
    </div>
  );
}
