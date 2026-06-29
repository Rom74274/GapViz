import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function CgvPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft size={12} />
        Retour
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Conditions Générales de Vente
      </h1>
      <p className="mt-1 text-xs text-text-muted">Dernière mise à jour : mai 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-text-secondary">
        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 1 — Objet
          </h2>
          <p>
            Les présentes Conditions Générales de Vente (ci-après « CGV »)
            régissent l'utilisation du service <strong>Star Gap</strong>, outil
            SaaS d'analyse SEO et de clustering de mots-clés, édité par Romain
            Thomas, entrepreneur individuel sous le régime de la micro-entreprise,
            domicilié 3 rue Mignard, 75016 Paris, SIREN 106 585 144 (ci-après «
            l'Éditeur »).
          </p>
          <p className="mt-2">
            En créant un compte ou en souscrivant à un plan payant, l'utilisateur
            accepte sans réserve les présentes CGV.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 2 — Plans et tarifs
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-left text-text-muted">
                <th className="pb-2 pr-4">Plan</th>
                <th className="pb-2 pr-4">Prix</th>
                <th className="pb-2">Inclus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50">
              <tr>
                <td className="py-2 pr-4 font-medium text-text-primary">Free</td>
                <td className="py-2 pr-4">0 €/mois</td>
                <td className="py-2">1 projet, 500 KWs/projet, 3 concurrents, 2 clusterings managés/mois</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-text-primary">Pro</td>
                <td className="py-2 pr-4">19 €/mois TTC</td>
                <td className="py-2">5 projets, 5 000 KWs/projet, 10 concurrents, 20 clusterings managés/mois, export CSV, vue tableau complète</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-text-primary">Agency</td>
                <td className="py-2 pr-4">79 €/mois TTC</td>
                <td className="py-2">Projets illimités, KWs illimités, concurrents illimités, clusterings illimités, export CSV, vue tableau complète</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-text-muted">
            TVA non applicable, art. 293 B du CGI (micro-entreprise en
            franchise de base de TVA).
          </p>
          <p className="mt-1 text-xs text-text-muted">
            L'Éditeur se réserve le droit de modifier les tarifs à tout moment.
            Les nouveaux tarifs s'appliquent aux nouvelles souscriptions et aux
            renouvellements suivant la modification, avec un préavis de 30 jours
            pour les abonnés existants.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 3 — Inscription et compte
          </h2>
          <p>
            L'inscription est gratuite et nécessite une adresse email valide et
            un mot de passe. L'utilisateur est responsable de la confidentialité
            de ses identifiants. Toute utilisation du compte avec ses
            identifiants est réputée faite par l'utilisateur lui-même.
          </p>
          <p className="mt-2">
            L'Éditeur se réserve le droit de suspendre ou supprimer un compte
            en cas de violation des présentes CGV ou d'utilisation abusive du
            service.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 4 — Paiement
          </h2>
          <p>
            Les paiements sont traités par <strong>Stripe Inc.</strong> Star Gap
            ne stocke aucune donnée de carte bancaire.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Facturation mensuelle, renouvelée automatiquement.</li>
            <li>Le paiement est dû au début de chaque période de facturation.</li>
            <li>En cas d'échec de paiement, Stripe effectue plusieurs tentatives
              automatiques. En cas d'échec définitif, l'abonnement est suspendu
              et le compte rebasculé vers le plan Free.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 5 — Droit de rétractation
          </h2>
          <p>
            Conformément à l'article L221-28 du Code de la consommation,
            l'utilisateur reconnaît que le service est accessible immédiatement
            après la souscription. En acceptant la fourniture immédiate du
            service, l'utilisateur renonce expressément à son droit de
            rétractation de 14 jours.
          </p>
          <p className="mt-2">
            Toutefois, l'utilisateur peut résilier son abonnement à tout moment
            (cf. Article 6). Aucun remboursement prorata n'est effectué pour la
            période en cours.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 6 — Résiliation
          </h2>
          <p>
            L'utilisateur peut résilier son abonnement à tout moment depuis la
            page Réglages de l'application (bouton « Gérer mon abonnement »,
            qui ouvre le portail Stripe).
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>L'accès aux fonctionnalités du plan payant est maintenu
              jusqu'à la fin de la période de facturation en cours.</li>
            <li>À l'expiration, le compte rebasculle automatiquement vers le
              plan Free.</li>
            <li>Les données du projet sont conservées mais les limitations du
              plan Free s'appliquent (vue tableau tronquée, pas d'export,
              etc.).</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 7 — Limitation de responsabilité
          </h2>
          <p>
            Star Gap est fourni « en l'état ». L'Éditeur ne garantit pas que
            le service sera exempt d'interruptions ou d'erreurs. En aucun cas
            l'Éditeur ne pourra être tenu responsable de dommages indirects
            (perte de données, manque à gagner, perte de clientèle) résultant
            de l'utilisation ou de l'impossibilité d'utiliser le service.
          </p>
          <p className="mt-2">
            La responsabilité totale de l'Éditeur est limitée au montant des
            sommes effectivement versées par l'utilisateur au cours des 12
            derniers mois.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 8 — Propriété intellectuelle
          </h2>
          <p>
            L'utilisateur conserve l'intégralité des droits sur les données
            qu'il importe dans Star Gap (fichiers CSV, mots-clés, etc.).
            L'Éditeur n'utilise ces données que pour fournir le service.
          </p>
          <p className="mt-2">
            L'application Star Gap, son code, son interface et ses algorithmes
            restent la propriété exclusive de l'Éditeur.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 9 — Données personnelles
          </h2>
          <p>
            Le traitement des données personnelles est décrit dans notre{' '}
            <Link to="/privacy" className="text-accent hover:text-accent-hover">
              Politique de confidentialité
            </Link>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 10 — Droit applicable et litiges
          </h2>
          <p>
            Les présentes CGV sont régies par le droit français. En cas de
            litige, les parties s'efforceront de trouver une solution amiable.
            À défaut, les tribunaux compétents seront ceux du lieu de résidence
            de l'Éditeur.
          </p>
          <p className="mt-2">
            Conformément à l'article L612-1 du Code de la consommation, le
            consommateur peut recourir gratuitement à un médiateur de la
            consommation en vue de la résolution amiable du litige.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            Article 11 — Modification des CGV
          </h2>
          <p>
            L'Éditeur se réserve le droit de modifier les présentes CGV à tout
            moment. Les utilisateurs seront informés par email ou par
            notification dans l'application. La poursuite de l'utilisation du
            service après modification vaut acceptation des nouvelles CGV.
          </p>
        </section>
      </div>
    </div>
  );
}
