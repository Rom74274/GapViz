import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-mono text-5xl font-semibold text-text-muted">404</h1>
      <p className="mt-4 text-text-secondary">Cette page n'existe pas.</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md border border-border-subtle px-4 py-2 text-sm hover:border-border-strong"
      >
        Retour à l'accueil
      </Link>
    </div>
  );
}
