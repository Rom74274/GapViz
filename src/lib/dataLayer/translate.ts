// Conversions entre la forme Supabase (split keywords + keyword_positions)
// et la forme flat Dexie historique (1 row par KW × source).
//
// Règle générale :
// - Supabase est le futur source-of-truth (multi-device, RLS).
// - Dexie reste la shape interne de l'app (graph, filters, exports — déjà
//   construits sur cette forme). On ne refactore PAS le data model interne.
// - Ce module est la frontière. Toute lecture Supabase passe par
//   `fromSupabase…`, toute écriture Supabase passe par `toSupabase…`
//   (à venir en 1e.2).

import type {
  Cluster as DexieCluster,
  Competitor as DexieCompetitor,
  Intent,
  Keyword as DexieKeyword,
  Project as DexieProject,
} from '@/lib/db';
import type {
  SupabaseCluster,
  SupabaseCompetitor,
  SupabaseKeyword,
  SupabaseKeywordPosition,
  SupabaseProject,
} from '@/lib/supabaseTypes';

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function projectFromSupabase(p: SupabaseProject): DexieProject {
  return {
    id: p.id,
    name: p.name,
    myDomain: p.my_domain,
    country: p.country,
    createdAt: new Date(p.created_at).getTime(),
    updatedAt: new Date(p.updated_at).getTime(),
  };
}

// ---------------------------------------------------------------------------
// Competitor — isMe dérivé client-side de project.my_domain
// ---------------------------------------------------------------------------

export function competitorFromSupabase(
  c: SupabaseCompetitor,
  myDomain: string,
): DexieCompetitor {
  return {
    id: c.id,
    projectId: c.project_id,
    domain: c.domain,
    label: c.label ?? c.domain,
    color: c.color,
    isMe: c.domain === myDomain,
  };
}

// ---------------------------------------------------------------------------
// Cluster — is_noise / excluded de Supabase ignorés pour l'instant
// (UX state local : filterStore + manualX/Y). À revisiter en 1e.4.
// ---------------------------------------------------------------------------

export function clusterFromSupabase(c: SupabaseCluster): DexieCluster {
  return {
    id: c.id,
    projectId: c.project_id,
    name: c.name,
    parentId: c.parent_id,
    // manualX / manualY restent en local — cf. validation utilisateur.
  };
}

// ---------------------------------------------------------------------------
// Keywords — 1 SupabaseKeyword + N SupabaseKeywordPosition → N DexieKeyword
// (split → flat). L'id flat est synthétique pour rester stable dans Dexie.
// ---------------------------------------------------------------------------

export function keywordsFromSupabase(
  k: SupabaseKeyword,
  positions: SupabaseKeywordPosition[],
): DexieKeyword[] {
  const out: DexieKeyword[] = [];
  if (positions.length === 0) {
    // KW orphelin (pas de position) — on garde une trace mais sans source.
    // Cas pathologique, ne devrait pas arriver après un import normal.
    out.push(makeFlat(k, null));
    return out;
  }
  for (const pos of positions) {
    out.push(makeFlat(k, pos));
  }
  return out;
}

function makeFlat(
  k: SupabaseKeyword,
  pos: SupabaseKeywordPosition | null,
): DexieKeyword {
  return {
    // ID flat synthétique : kwId si pas de position, kwId::posId sinon.
    // Stable → on peut écrire/lire en cache Dexie sans collision.
    id: pos ? `${k.id}::${pos.id}` : k.id,
    projectId: k.project_id,
    keyword: k.keyword,
    volume: k.volume ?? 0,
    kd: k.kd,
    cpc: k.cpc,
    intent: (k.intent ?? []) as Intent[],
    clusterId: k.cluster_id,
    sourceDomain: pos?.source_domain ?? '',
    position: pos?.position ?? null,
    url: pos?.url ?? null,
    traffic: k.traffic,
    serpFeatures: k.serp_features,
    branded: k.branded,
  };
}

// ---------------------------------------------------------------------------
// Bundle helper — convertit le résultat d'un fetch complet en forme app
// ---------------------------------------------------------------------------

export interface RemoteProjectGraphBundle {
  project: SupabaseProject;
  competitors: SupabaseCompetitor[];
  keywords: SupabaseKeyword[];
  positions: SupabaseKeywordPosition[];
  clusters: SupabaseCluster[];
}

export interface FlatProjectGraph {
  project: DexieProject;
  competitors: DexieCompetitor[];
  keywords: DexieKeyword[];
  clusters: DexieCluster[];
}

export function flattenRemoteBundle(b: RemoteProjectGraphBundle): FlatProjectGraph {
  const project = projectFromSupabase(b.project);
  const competitors = b.competitors.map((c) =>
    competitorFromSupabase(c, b.project.my_domain),
  );
  const clusters = b.clusters.map(clusterFromSupabase);
  // Index positions par keyword_id
  const byKw = new Map<string, SupabaseKeywordPosition[]>();
  for (const p of b.positions) {
    const list = byKw.get(p.keyword_id) ?? [];
    list.push(p);
    byKw.set(p.keyword_id, list);
  }
  const keywords: DexieKeyword[] = [];
  for (const k of b.keywords) {
    keywords.push(...keywordsFromSupabase(k, byKw.get(k.id) ?? []));
  }
  return { project, competitors, keywords, clusters };
}
