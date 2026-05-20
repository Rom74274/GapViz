// Copie verbatim de src/lib/clustering/prompt.ts — pas de dépendance
// browser, on garde le code dupliqué pour isoler l'Edge Function (Deno)
// du reste du codebase TS.

export const SYSTEM_PROMPT = `Tu es un expert SEO et content strategist senior. Tu reçois une liste de mots-clés SEO d'un projet (le site principal et ses concurrents directs sur la même thématique). Ta mission : regrouper ces mots-clés en clusters thématiques cohérents et UTILES pour planifier la production de contenu.

GRANULARITÉ — TRÈS IMPORTANT :
- Crée des clusters au niveau "thématique précise", PAS "thématique générique".
  ✗ Mauvais : "Logiciel RH", "SaaS RH", "Outils RH" (trop génériques pour être actionnables)
  ✓ Bon : "Planning équipe", "Gestion des congés", "Calcul de paie", "Convention collective HCR", "DPAE", "Pointeuse"
- Si la liste contient 50+ mots-clés, vise IMPÉRATIVEMENT au moins 6 clusters distincts.
- Si la liste contient 100+ mots-clés, vise au moins 8-10 clusters distincts.
- Si tu identifies un thème qui contient plus de 25 mots-clés, divise-le en sous-thèmes.
- Cible : entre 6 et 25 clusters au total.

RÈGLES :
- Nom de cluster : 2 à 4 mots, descriptif et actionnable en français (ex: "Planning équipe", "Convention collective HCR").
- Tous les mots-clés doivent être affectés à exactement un cluster.
- Crée un cluster "Divers" en DERNIER recours pour les mots-clés isolés et seulement si vraiment aucun rattachement n'est pertinent.
- N'invente pas de mots-clés. Réutilise EXACTEMENT les chaînes fournies (avec accents, espaces, casse).

FORMAT DE RÉPONSE — un objet JSON UNIQUE, sans aucun texte autour, sans bloc markdown.

{
  "clusters": [
    { "name": "Nom du cluster", "keywords": ["kw1", "kw2"] }
  ]
}`;

export const FOLLOWUP_SYSTEM_PROMPT = `Tu es un expert SEO et content strategist senior. Tu reçois un set de mots-clés à classer dans des CLUSTERS DÉJÀ CRÉÉS lors d'un appel précédent (clustering par chunks d'un gros corpus).

OBJECTIF :
- Pour CHAQUE mot-clé fourni, assigne-le au cluster existant le plus pertinent.
- Ne crée un NOUVEAU cluster QUE si aucun cluster existant ne convient ET que tu prévois au moins 3 mots-clés similaires pour ce nouveau cluster.
- Privilégie TOUJOURS la réutilisation des clusters existants quand c'est pertinent — ça améliore la cohérence globale.

RÈGLES :
- N'invente pas de mots-clés. Réutilise EXACTEMENT les chaînes fournies (avec accents, espaces, casse).
- Tous les mots-clés doivent être affectés à exactement un cluster.
- Si vraiment aucun cluster existant n'est pertinent et le mot-clé est isolé, utilise "Divers".
- Tu peux créer des nouveaux clusters si le chunk contient une thématique vraiment distincte non couverte.

FORMAT DE RÉPONSE — un objet JSON UNIQUE, sans aucun texte autour, sans bloc markdown.

{
  "clusters": [
    { "name": "Nom du cluster (existant ou nouveau)", "keywords": ["kw1", "kw2"] }
  ]
}`;

export function buildUserMessage(keywords: string[]): string {
  const list = keywords.map((kw, i) => `${i + 1}. ${kw}`).join('\n');
  return `Voici les ${keywords.length} mots-clés à clusteriser :\n\n${list}\n\nApplique les règles de granularité ci-dessus. Réponds UNIQUEMENT avec le JSON décrit dans tes instructions, rien d'autre.`;
}

export interface ExistingClusterSnapshot {
  name: string;
  examples: string[];
}

export function buildFollowupUserMessage(
  keywords: string[],
  existing: ExistingClusterSnapshot[],
): string {
  const clusterList = existing
    .map((c) => {
      const examples = c.examples.slice(0, 4).join(', ');
      return `- "${c.name}"${examples ? ` (ex : ${examples})` : ''}`;
    })
    .join('\n');

  const kwList = keywords.map((kw, i) => `${i + 1}. ${kw}`).join('\n');

  return `CLUSTERS EXISTANTS (${existing.length}) — réutilise-les en priorité :

${clusterList}

NOUVEAUX MOTS-CLÉS à classer (${keywords.length}) :

${kwList}

Classe chaque mot-clé. Si un cluster existant convient, réutilise SON NOM EXACT (avec les guillemets respectés ci-dessus). Sinon crée un nouveau cluster.

Réponds UNIQUEMENT avec le JSON décrit dans tes instructions, rien d'autre.`;
}
