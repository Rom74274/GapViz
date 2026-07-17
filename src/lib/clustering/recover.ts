import { supabase } from '@/lib/supabase';
import { fetchProjectDetailFromSupabase, syncProjectToDexie } from '@/lib/dataLayer';

// ---------------------------------------------------------------------------
// Récupération LOCALE des mots-clés "Non clusterisé" — 0 appel Claude, 0 coût.
//
// Contexte : le clustering chunké demande à Claude de recopier chaque mot-clé
// verbatim. Il en oublie / reformule une partie à chaque chunk → ces KWs
// atterrissent dans le cluster "Non clusterisé" (les `unmatched`). Ils ont
// pourtant une thématique claire et devraient rejoindre un cluster existant.
//
// Cette passe re-classe ces orphelins par similarité lexicale (TF-IDF léger)
// contre les clusters DÉJÀ créés. Purement déterministe et client-side :
// on réutilise l'intelligence déjà payée (les clusters + leurs membres),
// on ne rappelle jamais l'API.
// ---------------------------------------------------------------------------

const UNCLUSTERED_LABEL = 'Non clusterisé';
const JUNK_CLUSTER_NAMES = new Set(['non clusterisé', 'divers']);

// Stopwords FR + bruit SEO fréquent. Volontairement court : on garde les mots
// porteurs de sens thématique.
const STOPWORDS = new Set(
  (
    'de la le les un une des et en a au aux du pour avec sur dans par ou ce se sa ' +
    'son ses mon ma mes ta ton tes nos vos leur leurs qui que quoi dont est sont ' +
    'etre avoir plus moins tout tous toute toutes il elle ils elles je tu nous ' +
    'vous on ne pas ci vs comment quel quelle quels quelles c d l s meilleur ' +
    'meilleure meilleurs meilleures avis prix'
  ).split(' '),
);

export interface RecoverAssignment {
  keywordId: string;
  keyword: string;
  clusterId: string;
  clusterName: string;
  score: number;
}

export interface RecoverReport {
  applied: boolean;
  totalOrphans: number;
  recovered: number;
  remaining: number;
  minScore: number;
  perCluster: Array<{ clusterId: string; name: string; count: number }>;
  samples: RecoverAssignment[]; // échantillon pour prévisualisation
}

export interface RecoverOptions {
  apply: boolean;
  minScore?: number; // seuil de confiance (défaut 0.2 — cf. recover.ts sim)
  onProgress?: (msg: string) => void;
}

const DEFAULT_MIN_SCORE = 0.2;

const log = (...a: unknown[]) => console.log('[recover]', ...a);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Tokenise : lowercase, sans accents, split non-alphanum, drop stopwords &
// tokens < 2 chars, dé-pluralise grossièrement (trailing 's' sur mots longs).
function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const raw of stripAccents(s.toLowerCase()).split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    out.push(raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw);
  }
  return out;
}

type ClusterRow = { id: string; name: string; is_noise: boolean; excluded: boolean };
type KwRow = { id: string; keyword: string; cluster_id: string | null };

async function fetchAllKeywords(projectId: string): Promise<KwRow[]> {
  const PAGE = 1000;
  const all: KwRow[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase
      .from('keywords')
      .select('id, keyword, cluster_id')
      .eq('project_id', projectId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch keywords: ${error.message}`);
    const batch = (data ?? []) as KwRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function recoverUnclustered(
  projectId: string,
  opts: RecoverOptions,
): Promise<RecoverReport> {
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  opts.onProgress?.('Chargement des clusters et mots-clés…');

  const { data: clusterData, error: clusterErr } = await supabase
    .from('clusters')
    .select('id, name, is_noise, excluded')
    .eq('project_id', projectId);
  if (clusterErr) throw new Error(`fetch clusters: ${clusterErr.message}`);
  const clusters = (clusterData ?? []) as ClusterRow[];

  const keywords = await fetchAllKeywords(projectId);
  log('loaded', { clusters: clusters.length, keywords: keywords.length });

  // Cluster "Non clusterisé" (peut être absent si tout était matché).
  const unclusteredCluster = clusters.find(
    (c) => c.name.trim().toLowerCase() === UNCLUSTERED_LABEL.toLowerCase(),
  );
  const unclusteredId = unclusteredCluster?.id ?? null;

  // Clusters cibles = tout sauf poubelles / exclus / bruit.
  const targets = clusters.filter(
    (c) => !c.is_noise && !c.excluded && !JUNK_CLUSTER_NAMES.has(c.name.trim().toLowerCase()),
  );
  if (targets.length === 0) {
    throw new Error(
      'Aucun cluster cible exploitable. Lance d’abord un clustering, puis récupère les orphelins.',
    );
  }

  // Orphelins = KWs dans "Non clusterisé" ou sans cluster.
  const orphans = keywords.filter(
    (k) => k.cluster_id === null || (unclusteredId !== null && k.cluster_id === unclusteredId),
  );
  const totalOrphans = orphans.length;
  log('orphans', { totalOrphans });
  if (totalOrphans === 0) {
    return {
      applied: false,
      totalOrphans: 0,
      recovered: 0,
      remaining: 0,
      minScore,
      perCluster: [],
      samples: [],
    };
  }

  // ---- Profils de tokens par cluster cible (à partir des membres DÉJÀ rangés
  // + du nom du cluster). weight[c][t] = fraction des membres contenant t. ----
  opts.onProgress?.('Construction des profils de clusters…');
  const orphanIds = new Set(orphans.map((o) => o.id));
  const memberCount = new Map<string, number>();
  const tokenDocFreq = new Map<string, Map<string, number>>(); // clusterId -> token -> #membres
  for (const c of targets) {
    memberCount.set(c.id, 0);
    tokenDocFreq.set(c.id, new Map());
  }
  const targetIds = new Set(targets.map((c) => c.id));

  for (const k of keywords) {
    if (!k.cluster_id || !targetIds.has(k.cluster_id) || orphanIds.has(k.id)) continue;
    memberCount.set(k.cluster_id, (memberCount.get(k.cluster_id) ?? 0) + 1);
    const seen = new Set(tokenize(k.keyword));
    const df = tokenDocFreq.get(k.cluster_id)!;
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }

  // Injecte les tokens du NOM du cluster comme signal fort (représentativité 1).
  const nameTokens = new Map<string, Set<string>>();
  for (const c of targets) nameTokens.set(c.id, new Set(tokenize(c.name)));

  // weight[c][t] ∈ [0,1] : max(fraction de membres, présence dans le nom).
  const weight = new Map<string, Map<string, number>>();
  for (const c of targets) {
    const w = new Map<string, number>();
    const mc = memberCount.get(c.id) ?? 0;
    const df = tokenDocFreq.get(c.id)!;
    for (const [t, n] of df) w.set(t, mc > 0 ? n / mc : 0);
    for (const t of nameTokens.get(c.id)!) w.set(t, Math.max(w.get(t) ?? 0, 1));
    weight.set(c.id, w);
  }

  // idf sur les clusters : tokens présents dans peu de clusters = distinctifs.
  const clustersWithToken = new Map<string, number>();
  for (const c of targets) {
    for (const t of weight.get(c.id)!.keys()) {
      clustersWithToken.set(t, (clustersWithToken.get(t) ?? 0) + 1);
    }
  }
  const N = targets.length;
  const idf = (t: string) => Math.log(1 + N / (clustersWithToken.get(t) ?? N));

  // ---- Scoring des orphelins ----
  opts.onProgress?.('Re-classement des orphelins…');
  const buckets = new Map<string, string[]>(); // clusterId -> kwIds
  const assignments: RecoverAssignment[] = [];
  const nameById = new Map(targets.map((c) => [c.id, c.name]));

  for (const o of orphans) {
    const tt = tokenize(o.keyword);
    if (tt.length === 0) continue;
    let bestId: string | null = null;
    let bestScore = 0;
    for (const c of targets) {
      const w = weight.get(c.id)!;
      let sc = 0;
      for (const t of tt) {
        const wt = w.get(t);
        if (wt) sc += wt * idf(t);
      }
      sc /= tt.length; // moyenne par token → comparable entre KWs courts/longs
      if (sc > bestScore) {
        bestScore = sc;
        bestId = c.id;
      }
    }
    if (bestId && bestScore >= minScore) {
      (buckets.get(bestId) ?? buckets.set(bestId, []).get(bestId)!).push(o.id);
      assignments.push({
        keywordId: o.id,
        keyword: o.keyword,
        clusterId: bestId,
        clusterName: nameById.get(bestId) ?? '?',
        score: Math.round(bestScore * 100) / 100,
      });
    }
  }

  const recovered = assignments.length;
  const perCluster = [...buckets.entries()]
    .map(([clusterId, ids]) => ({
      clusterId,
      name: nameById.get(clusterId) ?? '?',
      count: ids.length,
    }))
    .sort((a, b) => b.count - a.count);
  const samples = assignments
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  log('scored', { recovered, remaining: totalOrphans - recovered });

  const report: RecoverReport = {
    applied: false,
    totalOrphans,
    recovered,
    remaining: totalOrphans - recovered,
    minScore,
    perCluster,
    samples,
  };

  if (!opts.apply || recovered === 0) return report;

  // ---- Écriture Supabase (source-of-truth) ----
  opts.onProgress?.('Enregistrement dans Supabase…');
  for (const [clusterId, kwIds] of buckets) {
    for (let i = 0; i < kwIds.length; i += 500) {
      const chunk = kwIds.slice(i, i + 500);
      const { error } = await supabase
        .from('keywords')
        .update({ cluster_id: clusterId })
        .in('id', chunk);
      if (error) throw new Error(`assign cluster: ${error.message}`);
    }
  }

  // Supprime le cluster "Non clusterisé" s'il est désormais vide (tous ses
  // membres ont été récupérés). O(n) via map id -> cluster_id d'origine.
  if (unclusteredId) {
    const originById = new Map(orphans.map((o) => [o.id, o.cluster_id]));
    const inUnclustered = orphans.filter((o) => o.cluster_id === unclusteredId).length;
    const movedOut = assignments.filter(
      (a) => originById.get(a.keywordId) === unclusteredId,
    ).length;
    if (inUnclustered - movedOut === 0) {
      const { error } = await supabase.from('clusters').delete().eq('id', unclusteredId);
      if (error) log('warn: delete empty unclustered failed', error.message);
      else log('deleted empty "Non clusterisé" cluster');
    }
  }

  // Re-sync du cache Dexie → l'UI (graph, tableau, panels) se rafraîchit seule.
  opts.onProgress?.('Rafraîchissement local…');
  const detail = await fetchProjectDetailFromSupabase(projectId);
  if (detail.ok) await syncProjectToDexie(detail.data);

  report.applied = true;
  return report;
}
