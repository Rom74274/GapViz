import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Mail, Puzzle } from 'lucide-react';
import { useExtensionInstalled } from '@/lib/extensionInstall';

const CONTACT_EMAIL = 'r.thomas74274@gmail.com';

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
            Extension Star Gap Importer
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Capture les exports Ahrefs en 1 clic et les pousse dans tes projets.
          </p>
        </div>
      </div>

      {installed ? (
        <div className="mt-6 flex items-center gap-2 rounded-md border border-green-400/40 bg-green-400/5 px-3 py-2 text-sm text-green-300">
          <Check size={14} />
          Extension détectée (v{version}). Tu peux fermer cet onglet.
        </div>
      ) : (
        <div className="mt-8 rounded-md border border-accent/30 bg-accent/5 p-5">
          <p className="text-sm font-medium text-text-primary">
            Bêta privée
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            L'extension est en cours de validation sur le Chrome Web Store.
            En attendant, contacte-moi par email pour recevoir un accès
            anticipé — je t'envoie le fichier et les instructions
            d'installation.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Accès bêta extension Star Gap")}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Mail size={13} />
            {CONTACT_EMAIL}
          </a>
        </div>
      )}
    </div>
  );
}
