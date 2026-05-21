import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft size={12} />
        Retour
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Mentions légales</h1>
      <p className="mt-1 text-xs text-text-muted">Dernière mise à jour : mai 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-text-secondary">
        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">Éditeur du site</h2>
          <p>
            Le site et l'application <strong>Star Gap</strong> sont édités par :
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Romain Thomas, auto-entrepreneur</li>
            <li>Adresse : 3 rue Mignard</li>
            <li>Email : <a href="mailto:r.thomas74274@gmail.com" className="text-accent hover:text-accent-hover">r.thomas74274@gmail.com</a></li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">Hébergement</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Site statique (front-end)</strong> : GitHub Pages — GitHub Inc.,
              88 Colin P Kelly Jr St, San Francisco, CA 94107, États-Unis
            </li>
            <li>
              <strong>Base de données et authentification</strong> : Supabase Inc.,
              970 Toa Payoh North #07-04, Singapour 318992
            </li>
            <li>
              <strong>Paiements</strong> : Stripe Inc., 354 Oyster Point Blvd,
              South San Francisco, CA 94080, États-Unis
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">Propriété intellectuelle</h2>
          <p>
            L'ensemble du contenu de l'application Star Gap (textes, interface,
            code source, graphismes, logos) est protégé par le droit d'auteur
            et reste la propriété exclusive de Romain Thomas, sauf mention
            contraire. Toute reproduction, même partielle, est interdite sans
            autorisation écrite préalable.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">Responsabilité</h2>
          <p>
            Romain Thomas s'efforce de fournir des informations aussi précises
            que possible. Toutefois, il ne pourra être tenu responsable des
            omissions, inexactitudes ou carences dans la mise à jour, qu'elles
            soient de son fait ou du fait des tiers partenaires qui lui
            fournissent ces informations.
          </p>
          <p className="mt-2">
            Les données SEO affichées dans l'application (volumes, positions,
            KD, CPC) proviennent des fichiers CSV importés par l'utilisateur.
            Star Gap n'en garantit ni l'exactitude ni l'exhaustivité.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">Données personnelles</h2>
          <p>
            Pour plus d'informations sur le traitement de vos données
            personnelles, consultez notre{' '}
            <Link to="/privacy" className="text-accent hover:text-accent-hover">
              Politique de confidentialité
            </Link>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">Contact</h2>
          <p>
            Pour toute question relative au site ou à l'application :{' '}
            <a href="mailto:r.thomas74274@gmail.com" className="text-accent hover:text-accent-hover">
              r.thomas74274@gmail.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
