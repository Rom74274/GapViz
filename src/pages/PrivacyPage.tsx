import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPage() {
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
        Politique de confidentialité
      </h1>
      <p className="mt-1 text-xs text-text-muted">Dernière mise à jour : juin 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-text-secondary">
        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            1. Responsable du traitement
          </h2>
          <p>
            Romain Thomas, entrepreneur individuel sous le régime de la
            micro-entreprise.
          </p>
          <p className="mt-1">
            Adresse : 3 rue Mignard, 75016 Paris, France
            <br />
            SIRET : <span className="font-mono">106 585 144 00012</span>
          </p>
          <p className="mt-1">
            Contact :{' '}
            <a href="mailto:r.thomas74274@gmail.com" className="text-accent hover:text-accent-hover">
              r.thomas74274@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            2. Données collectées et finalités
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-left text-text-muted">
                <th className="pb-2 pr-4">Donnée</th>
                <th className="pb-2 pr-4">Finalité</th>
                <th className="pb-2">Base légale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50">
              <tr>
                <td className="py-2 pr-4">Email, mot de passe</td>
                <td className="py-2 pr-4">Création et gestion de compte</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Nom d'affichage (optionnel)</td>
                <td className="py-2 pr-4">Personnalisation de l'interface</td>
                <td className="py-2">Consentement</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Données SEO (CSV importés : mots-clés, volumes, positions)</td>
                <td className="py-2 pr-4">Analyse de gaps et clustering</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Résultats de clustering</td>
                <td className="py-2 pr-4">Affichage des clusters dans l'application</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Informations de facturation (via Stripe)</td>
                <td className="py-2 pr-4">Gestion des abonnements et paiements</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            3. Durée de conservation
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Données de compte</strong> : conservées tant que le compte est actif.
              Supprimées dans les 30 jours suivant la demande de suppression du compte.
            </li>
            <li>
              <strong>Données SEO (projets, mots-clés, clusters)</strong> : conservées tant
              que le projet existe. L'utilisateur peut supprimer un projet à tout moment.
            </li>
            <li>
              <strong>Données de facturation</strong> : conservées conformément aux
              obligations légales comptables (10 ans).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            4. Sous-traitants
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-left text-text-muted">
                <th className="pb-2 pr-4">Sous-traitant</th>
                <th className="pb-2 pr-4">Rôle</th>
                <th className="pb-2">Localisation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50">
              <tr>
                <td className="py-2 pr-4">Supabase Inc.</td>
                <td className="py-2 pr-4">Base de données, authentification</td>
                <td className="py-2">Singapour / États-Unis</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Stripe Inc.</td>
                <td className="py-2 pr-4">Traitement des paiements</td>
                <td className="py-2">États-Unis</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">GitHub Inc.</td>
                <td className="py-2 pr-4">Hébergement du site statique (front-end)</td>
                <td className="py-2">États-Unis</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Anthropic PBC</td>
                <td className="py-2 pr-4">Clustering IA (modèle Claude, mode managé)</td>
                <td className="py-2">États-Unis</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            5. Transferts hors UE
          </h2>
          <p>
            Certains sous-traitants sont situés hors de l'Union Européenne
            (États-Unis, Singapour). Ces transferts sont encadrés par des
            clauses contractuelles types (CCT) approuvées par la Commission
            Européenne, conformément à l'article 46 du RGPD. Supabase et
            Stripe adhèrent au EU-US Data Privacy Framework.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            6. Cookies
          </h2>
          <p>
            Star Gap utilise uniquement des cookies <strong>strictement
            fonctionnels</strong> nécessaires au bon fonctionnement de
            l'application :
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Token de session Supabase</strong> : maintient la connexion de
              l'utilisateur. Durée : session. Pas de consentement requis (cookie essentiel).
            </li>
          </ul>
          <p className="mt-2">
            Aucun cookie de suivi, d'analyse ou publicitaire n'est utilisé.
            Aucun outil de tracking tiers (Google Analytics, Meta Pixel, etc.)
            n'est intégré.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            7. Vos droits
          </h2>
          <p>
            Conformément au RGPD (articles 15 à 22), vous disposez des droits
            suivants sur vos données personnelles :
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Accès</strong> : obtenir une copie de vos données</li>
            <li><strong>Rectification</strong> : corriger des données inexactes</li>
            <li><strong>Suppression</strong> : demander l'effacement de vos données</li>
            <li><strong>Portabilité</strong> : recevoir vos données dans un format structuré</li>
            <li><strong>Opposition</strong> : vous opposer à un traitement</li>
            <li><strong>Limitation</strong> : demander la suspension d'un traitement</li>
          </ul>
          <p className="mt-2">
            Pour exercer ces droits, contactez :{' '}
            <a href="mailto:r.thomas74274@gmail.com" className="text-accent hover:text-accent-hover">
              r.thomas74274@gmail.com
            </a>
          </p>
          <p className="mt-2">
            En cas de litige, vous pouvez introduire une réclamation auprès de
            la CNIL :{' '}
            <span className="text-text-primary">www.cnil.fr</span>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            8. Sécurité
          </h2>
          <p>
            Star Gap met en place des mesures techniques et organisationnelles
            appropriées pour protéger vos données : chiffrement en transit
            (HTTPS/TLS), authentification sécurisée (Supabase Auth), isolation
            des données par utilisateur (Row Level Security), et clés API
            stockées côté serveur (Edge Functions).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">
            9. Extension Chrome « Star Gap Importer »
          </h2>
          <p>
            L'extension Chrome <strong>Star Gap Importer</strong> est un
            composant optionnel qui automatise l'import de vos exports CSV
            depuis Ahrefs, Semrush et SE Ranking dans votre projet Star Gap.
            Elle ne fonctionne que sur les pages de ces trois sites et sur
            l'application Star Gap.
          </p>
          <p className="mt-3 font-medium text-text-primary">
            Données traitées par l'extension :
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>
              <strong>Fichier CSV exporté manuellement</strong> par vous-même
              depuis Ahrefs / Semrush / SE Ranking (mots-clés, positions,
              volumes). Transmis chiffré en HTTPS à l'API Star Gap pour
              traitement, puis stocké dans votre projet sur Supabase.
            </li>
            <li>
              <strong>Token de session éphémère</strong> (UUID v4, durée de vie
              10 minutes). Stocké uniquement dans <code className="rounded bg-bg-elevated px-1 py-0.5">chrome.storage.local</code>{' '}
              (isolation par extension, inaccessible aux sites web). Sert
              uniquement à relier l'export CSV au projet Star Gap de
              l'utilisateur authentifié.
            </li>
          </ul>
          <p className="mt-3 font-medium text-text-primary">
            Ce que l'extension ne fait PAS :
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>Aucun suivi de navigation, aucune analyse comportementale</li>
            <li>Aucune collecte sur d'autres sites que ceux listés ci-dessus</li>
            <li>Aucune lecture de vos cookies en dehors du <em>refetch</em> ciblé du CSV que vous venez d'exporter</li>
            <li>Aucune transmission à des tiers en dehors de Star Gap et son sous-traitant Supabase</li>
          </ul>
          <p className="mt-3 font-medium text-text-primary">
            Permissions Chrome demandées :
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>
              <code className="rounded bg-bg-elevated px-1 py-0.5">downloads</code> — intercepter le téléchargement du CSV
            </li>
            <li>
              <code className="rounded bg-bg-elevated px-1 py-0.5">storage</code> — stocker le token de session éphémère
            </li>
            <li>
              <code className="rounded bg-bg-elevated px-1 py-0.5">tabs</code> /{' '}
              <code className="rounded bg-bg-elevated px-1 py-0.5">activeTab</code> — afficher le statut de connexion et fermer l'onglet après import
            </li>
            <li>
              <code className="rounded bg-bg-elevated px-1 py-0.5">host_permissions</code> limitées à <code className="rounded bg-bg-elevated px-1 py-0.5">app.ahrefs.com</code>, <code className="rounded bg-bg-elevated px-1 py-0.5">*.semrush.com</code>, <code className="rounded bg-bg-elevated px-1 py-0.5">*.seranking.com</code> et l'API Star Gap
            </li>
          </ul>
          <p className="mt-3">
            Le code source de l'extension est consultable publiquement sur
            GitHub : <a
              href="https://github.com/Rom74274/GapViz/tree/main/extension"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              github.com/Rom74274/GapViz/tree/main/extension
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
