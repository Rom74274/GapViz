// Star Gap — Edge Function "cluster"
// =============================================================================
// Clustering managé Claude pour les utilisateurs sans BYOK. Le flow :
//   1) Vérifie le JWT user, charge profile (plan + clusterings_used + reset_at).
//   2) Applique le rolling reset 30j sur le compteur.
//   3) Gate quota selon le plan.
//   4) Fetch keywords (RLS), trie par volume desc, chunk si > 500.
//   5) Appelle Claude (modèle dépend du plan : Haiku pour Free, Sonnet pour Pro/Agency).
//   6) Parse + sauvegarde clusters (= mirror de saveClusteringToSupabase).
//   7) Incrémente profiles.clusterings_used.
//   8) Renvoie { ok, clusterCount, unmatchedCount, model, usage, clusteringsUsed }.
//
// Déploiement (manuel — l'utilisateur n'a pas la CLI installée) :
//   - Installer la CLI : brew install supabase/tap/supabase
//   - supabase login
//   - supabase link --project-ref <PROJECT_REF>
//   - supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   - supabase functions deploy cluster --no-verify-jwt false
// =============================================================================

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.110.7';
import Anthropic from 'npm:@anthropic-ai/sdk@0.36.3';
import { corsHeaders } from '../_shared/cors.ts';
import {
  SYSTEM_PROMPT,
  FOLLOWUP_SYSTEM_PROMPT,
  buildUserMessage,
  buildFollowupUserMessage,
  type ExistingClusterSnapshot,
} from './prompt.ts';
import { parseClusterResponse, type ClusterAssignment } from './parse.ts';

// -----------------------------------------------------------------------------
// Constantes plans — duplique sciemment src/lib/plans.ts. La duplication évite
// d'importer du code browser depuis Deno. Garder synchronisé manuellement.
// -----------------------------------------------------------------------------

const PLAN_MODELS: Record<string, string> = {
  free: 'claude-haiku-4-5',
  pro: 'claude-sonnet-5',
  agency: 'claude-sonnet-5',
};

const PLAN_QUOTAS: Record<string, number | null> = {
  free: 2,
  pro: 10,
  agency: 30, // managé plafonné (borne le coût API) ; illimité via BYOK
};

const CHUNK_THRESHOLD = 500;
const CHUNK_SIZE = 500;
const MAX_TOKENS = 32768;
const UNCLUSTERED_LABEL = 'Non clusterisé';
const RESET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Edge runtime misconfigured (env missing)' }, 500);
    }
    if (!anthropicKey) {
      return jsonResponse({ error: 'ANTHROPIC_API_KEY secret manquant' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1) Auth.
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: 'Invalid auth token' }, 401);
    }

    // 2) Body.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const projectId = body?.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      return jsonResponse({ error: 'projectId required' }, 400);
    }

    // 3) Profile + gate + rolling reset.
    const profileQ = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .maybeSingle();
    if (profileQ.error || !profileQ.data) {
      return jsonResponse(
        { error: 'profile not found', message: profileQ.error?.message },
        500,
      );
    }
    const plan = (profileQ.data.plan as string | null) ?? 'free';
    const model = PLAN_MODELS[plan] ?? PLAN_MODELS.free;
    const quota = PLAN_QUOTAS[plan] ?? null;

    // Le check + increment du quota est fait de façon ATOMIQUE plus bas (juste
    // avant l'appel Claude) via la fonction SQL consume_clustering_quota.
    let reserved = false;
    let usedAfter = 0;
    const refundQuota = async () => {
      if (!reserved) return;
      const r = await supabase.rpc('refund_clustering_quota', { p_user_id: user.id });
      if (r.error) console.error('[cluster] refund failed', r.error);
      reserved = false;
    };

    // 4) Fetch keywords (RLS filtre via user_id du projet).
    const kwQ = await supabase
      .from('keywords')
      .select('id, keyword, volume')
      .eq('project_id', projectId);
    if (kwQ.error) {
      return jsonResponse({ error: `Fetch keywords: ${kwQ.error.message}` }, 500);
    }
    const keywords = (kwQ.data ?? []) as Array<{
      id: string;
      keyword: string;
      volume: number | null;
    }>;
    if (keywords.length === 0) {
      return jsonResponse(
        { error: 'no_keywords', message: 'Aucun mot-clé à clusteriser' },
        400,
      );
    }
    const sorted = [...keywords].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    // Déduplication par TEXTE : un même mot-clé existe en plusieurs lignes (une
    // par domaine : ton site + concurrents). On ne clusterise que les textes
    // UNIQUES (représentant = plus gros volume, car trié desc). Le cluster est
    // ensuite appliqué à TOUTES les lignes du texte dans saveClusters. Évite
    // d'envoyer les doublons à Claude (moins de chunks, moins cher, plus rapide).
    const seenText = new Set<string>();
    const uniqueKeywords = sorted.filter((k) => {
      const t = k.keyword.trim().toLowerCase();
      if (seenText.has(t)) return false;
      seenText.add(t);
      return true;
    });

    // 5) Réservation ATOMIQUE d'un slot de quota (anti-abus concurrence) AVANT
    // l'appel Claude — verrou de ligne côté SQL. Remboursée si échec plus bas.
    const reserve = await supabase.rpc('consume_clustering_quota', {
      p_user_id: user.id,
      p_quota: quota,
      p_window_seconds: Math.round(RESET_WINDOW_MS / 1000),
    });
    if (reserve.error) {
      return jsonResponse({ error: 'quota_check_failed', message: reserve.error.message }, 500);
    }
    const reservation = (reserve.data as Array<{ allowed: boolean; used: number }> | null)?.[0];
    if (!reservation?.allowed) {
      return jsonResponse(
        {
          error: 'quota_exceeded',
          message: `Quota mensuel atteint (${reservation?.used ?? quota}/${quota}).`,
          used: reservation?.used ?? quota,
          limit: quota,
          plan,
        },
        429,
      );
    }
    reserved = true;
    usedAfter = reservation.used;

    // 6) Partie LONGUE (appels Claude séquentiels). On renvoie un FLUX qui émet
    // un "battement" (ligne vide) toutes les 10 s → la connexion n'est jamais
    // inactive, ce qui évite l'idle timeout (~150 s) de Supabase et laisse le
    // clustering aller jusqu'au bout. La DERNIÈRE ligne du flux est le résultat
    // JSON (`{ok:true,...}`) ou une erreur (`{error,message,...}`). Le slot de
    // quota est remboursé en cas d'échec.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const beat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode('\n'));
          } catch {
            /* flux déjà fermé */
          }
        }, 10000);
        const finish = (payload: unknown) => {
          clearInterval(beat);
          try {
            controller.enqueue(encoder.encode(JSON.stringify(payload)));
            controller.close();
          } catch {
            /* déjà fermé */
          }
        };
        try {
          const anthropic = new Anthropic({ apiKey: anthropicKey });
          const clusterRun = await runClustering(anthropic, model, uniqueKeywords);
          const { assignments, unmatched, totalChunks, inputTokens, outputTokens } = clusterRun;

          if (assignments.length === 0) {
            await refundQuota();
            finish({ error: 'no_clusters', message: "Claude n'a retourné aucun cluster valide" });
            return;
          }

          const saveResult = await saveClusters(supabase, projectId, assignments, unmatched);
          finish({
            ok: true,
            uniqueKeywordCount: uniqueKeywords.length,
            clusterCount: saveResult.newClusterCount,
            persistedAssignments: saveResult.matchedKwCount,
            unmatchedCount: unmatched.length,
            unclusteredClusterId: saveResult.unclusteredClusterId,
            totalChunks,
            model,
            usage: { inputTokens, outputTokens },
            clusteringsUsed: usedAfter,
            clusteringsLimit: quota,
          });
        } catch (e) {
          console.error('[cluster] streaming error', e);
          await refundQuota();
          finish({ error: 'internal', message: e instanceof Error ? e.message : 'unknown' });
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[cluster] uncaught error', e);
    return jsonResponse(
      {
        error: 'internal',
        message: e instanceof Error ? e.message : 'unknown',
      },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// -----------------------------------------------------------------------------
// Clustering orchestration (mirror src/lib/clustering/index.ts mais sans cache
// — le cache reste côté Dexie/client, l'Edge Function se contente de chunker
// et de mixer chunks initial + followup).
// -----------------------------------------------------------------------------

interface KwRow {
  id: string;
  keyword: string;
  volume: number | null;
}

async function runClustering(
  anthropic: Anthropic,
  model: string,
  sortedKeywords: KwRow[],
): Promise<{
  assignments: ClusterAssignment[];
  unmatched: string[];
  totalChunks: number;
  inputTokens: number;
  outputTokens: number;
}> {
  if (sortedKeywords.length <= CHUNK_THRESHOLD) {
    const kws = sortedKeywords.map((k) => k.keyword);
    const r = await callClaude(anthropic, model, SYSTEM_PROMPT, buildUserMessage(kws), kws);
    return {
      assignments: r.clusters,
      unmatched: r.unmatched,
      totalChunks: 1,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    };
  }

  // Chunked.
  const chunks: KwRow[][] = [];
  for (let i = 0; i < sortedKeywords.length; i += CHUNK_SIZE) {
    chunks.push(sortedKeywords.slice(i, i + CHUNK_SIZE));
  }

  const merged = new Map<string, ClusterAssignment>();
  const allUnmatched: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  // Premier chunk : bloquant.
  const firstKws = chunks[0]!.map((k) => k.keyword);
  const first = await callClaude(
    anthropic,
    model,
    SYSTEM_PROMPT,
    buildUserMessage(firstKws),
    firstKws,
  );
  totalInput += first.inputTokens;
  totalOutput += first.outputTokens;
  for (const c of first.clusters) mergeIntoMap(merged, c);
  allUnmatched.push(...first.unmatched);

  const kwVolumeMap = new Map<string, number>();
  for (const k of sortedKeywords) {
    const norm = k.keyword.trim().toLowerCase();
    if (!kwVolumeMap.has(norm)) kwVolumeMap.set(norm, k.volume ?? 0);
  }

  // Chunks suivants : résilient — un échec n'arrête pas le run.
  for (let i = 1; i < chunks.length; i++) {
    const chunkKws = chunks[i]!.map((k) => k.keyword);
    try {
      const snapshot = buildSnapshot(merged, kwVolumeMap);
      const r = await callClaude(
        anthropic,
        model,
        FOLLOWUP_SYSTEM_PROMPT,
        buildFollowupUserMessage(chunkKws, snapshot),
        chunkKws,
      );
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      for (const c of r.clusters) mergeIntoMap(merged, c);
      allUnmatched.push(...r.unmatched);
    } catch (e) {
      console.error(`[cluster] chunk ${i + 1}/${chunks.length} failed`, e);
      allUnmatched.push(...chunkKws);
    }
  }

  return {
    assignments: [...merged.values()],
    unmatched: allUnmatched,
    totalChunks: chunks.length,
    inputTokens: totalInput,
    outputTokens: totalOutput,
  };
}

function mergeIntoMap(
  map: Map<string, ClusterAssignment>,
  cluster: ClusterAssignment,
): void {
  const key = cluster.name.trim().toLowerCase();
  const existing = map.get(key);
  if (existing) {
    const seen = new Set(existing.keywords.map((k) => k.trim().toLowerCase()));
    for (const kw of cluster.keywords) {
      const norm = kw.trim().toLowerCase();
      if (!seen.has(norm)) {
        existing.keywords.push(kw);
        seen.add(norm);
      }
    }
  } else {
    map.set(key, { name: cluster.name, keywords: [...cluster.keywords] });
  }
}

function buildSnapshot(
  merged: Map<string, ClusterAssignment>,
  volumeMap: Map<string, number>,
): ExistingClusterSnapshot[] {
  const out: ExistingClusterSnapshot[] = [];
  for (const c of merged.values()) {
    const sorted = [...c.keywords].sort((a, b) => {
      const va = volumeMap.get(a.trim().toLowerCase()) ?? 0;
      const vb = volumeMap.get(b.trim().toLowerCase()) ?? 0;
      return vb - va;
    });
    out.push({ name: c.name, examples: sorted.slice(0, 4) });
  }
  out.sort((a, b) => b.examples.length - a.examples.length);
  return out;
}

async function callClaude(
  anthropic: Anthropic,
  model: string,
  systemPrompt: string,
  userMessage: string,
  inputKeywords: string[],
): Promise<{
  clusters: ClusterAssignment[];
  unmatched: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  // Streaming requis pour les requêtes longues (cf. clustering browser).
  const response = await anthropic.messages
    .stream({
      model,
      max_tokens: MAX_TOKENS,
      // Sonnet 5 fait de la réflexion étendue par défaut, qui mangeait tout le
      // budget de tokens (stop_reason=max_tokens, aucun texte). On la désactive :
      // le clustering est une tâche structurée qui n'en a pas besoin.
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
    .finalMessage();

  const textBlock = response.content.find(
    (c: { type: string }) => c.type === 'text',
  ) as { type: 'text'; text: string } | undefined;
  if (!textBlock || textBlock.type !== 'text') {
    const blocks = response.content.map((c: { type: string }) => c.type).join(',') || 'vide';
    throw new Error(
      `Pas de réponse texte reçue de Claude (stop_reason=${response.stop_reason ?? '?'}, blocs=[${blocks}])`,
    );
  }
  const parsed = parseClusterResponse(textBlock.text, inputKeywords);
  return {
    clusters: parsed.clusters,
    unmatched: parsed.unmatched,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// -----------------------------------------------------------------------------
// Persistance des clusters — mirror de src/lib/dataLayer/write.ts
// saveClusteringToSupabase, mais en Deno + via le client supabase user-scoped.
// -----------------------------------------------------------------------------

async function saveClusters(
  supabase: SupabaseClient,
  projectId: string,
  assignments: ClusterAssignment[],
  unmatched: string[],
): Promise<{
  newClusterCount: number;
  unclusteredClusterId: string | null;
  matchedKwCount: number;
}> {
  // 1. Reset cluster_id sur tous les KWs du projet.
  {
    const { error } = await supabase
      .from('keywords')
      .update({ cluster_id: null })
      .eq('project_id', projectId);
    if (error) throw new Error(`reset cluster_id: ${error.message}`);
  }

  // 2. Delete old clusters.
  {
    const { error } = await supabase
      .from('clusters')
      .delete()
      .eq('project_id', projectId);
    if (error) throw new Error(`delete clusters: ${error.message}`);
  }

  // 3. Mapping keyword.text → keyword.id.
  const allKwsQ = await supabase
    .from('keywords')
    .select('id, keyword')
    .eq('project_id', projectId);
  if (allKwsQ.error) throw new Error(`fetch keywords: ${allKwsQ.error.message}`);
  // Map texte → TOUTES les lignes (une par domaine). Un même mot-clé existe en
  // plusieurs lignes (ton site + concurrents) : le cluster doit être appliqué à
  // TOUTES, sinon les lignes concurrentes restent en « Sans cluster ».
  const textToIds = new Map<string, string[]>();
  for (const k of allKwsQ.data ?? []) {
    const key = ((k as { keyword: string }).keyword).trim().toLowerCase();
    const arr = textToIds.get(key);
    if (arr) arr.push((k as { id: string }).id);
    else textToIds.set(key, [(k as { id: string }).id]);
  }

  // 4. Construit clusters + buckets.
  const newClusters: Array<{
    id: string;
    project_id: string;
    name: string;
    parent_id: null;
    is_noise: boolean;
    excluded: boolean;
  }> = [];
  const assignBuckets: Array<{ clusterId: string; kwIds: string[] }> = [];
  const matched = new Set<string>();

  for (const a of assignments) {
    const clusterId = crypto.randomUUID();
    newClusters.push({
      id: clusterId,
      project_id: projectId,
      name: a.name,
      parent_id: null,
      is_noise: false,
      excluded: false,
    });
    const kwIds: string[] = [];
    for (const kwText of a.keywords) {
      const ids = textToIds.get(kwText.trim().toLowerCase());
      if (!ids) continue;
      for (const id of ids) {
        if (!matched.has(id)) {
          kwIds.push(id);
          matched.add(id);
        }
      }
    }
    if (kwIds.length > 0) assignBuckets.push({ clusterId, kwIds });
  }

  // Bucket "Non clusterisé".
  let unclusteredClusterId: string | null = null;
  if (unmatched.length > 0) {
    unclusteredClusterId = crypto.randomUUID();
    newClusters.push({
      id: unclusteredClusterId,
      project_id: projectId,
      name: UNCLUSTERED_LABEL,
      parent_id: null,
      is_noise: false,
      excluded: false,
    });
    const kwIds: string[] = [];
    for (const kwText of unmatched) {
      const ids = textToIds.get(kwText.trim().toLowerCase());
      if (!ids) continue;
      for (const id of ids) {
        if (!matched.has(id)) {
          kwIds.push(id);
          matched.add(id);
        }
      }
    }
    if (kwIds.length > 0) {
      assignBuckets.push({ clusterId: unclusteredClusterId, kwIds });
    } else {
      newClusters.pop();
      unclusteredClusterId = null;
    }
  }

  // 5. Insert clusters.
  if (newClusters.length > 0) {
    const { error } = await supabase.from('clusters').insert(newClusters);
    if (error) throw new Error(`insert clusters: ${error.message}`);
  }

  // 6. Update keywords.cluster_id batché par bucket.
  let matchedKwCount = 0;
  for (const bucket of assignBuckets) {
    for (const idsChunk of chunked(bucket.kwIds, 500)) {
      const { error } = await supabase
        .from('keywords')
        .update({ cluster_id: bucket.clusterId })
        .in('id', idsChunk);
      if (error) throw new Error(`assign cluster: ${error.message}`);
      matchedKwCount += idsChunk.length;
    }
  }

  return {
    newClusterCount: newClusters.length,
    unclusteredClusterId,
    matchedKwCount,
  };
}

function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}
