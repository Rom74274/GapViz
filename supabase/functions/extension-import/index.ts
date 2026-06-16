// Star Gap — Edge Function "extension-import"
// =============================================================================
// Reçoit un CSV Ahrefs depuis l'extension Chrome + un token de session.
// Valide le token, parse le CSV, crée un projet avec ses mots-clés, marque
// la session comme completed → renvoie le project_id pour redirection.
//
// L'extension n'a pas de JWT user (elle tourne dans Chrome côté user, pas
// authentifiée). La sécurité repose sur le token éphémère (UUID, 10 min)
// stocké dans `import_sessions` qui est créé côté app Star Gap avec le
// user_id de la session courante. Service role key pour bypass RLS.
//
// Secrets requis :
//   SUPABASE_URL          — auto-injecté
//   SB_SERVICE_ROLE_KEY   — service role pour bypass RLS (déjà set)
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { type ParsedRow } from './parsers/_shared.ts';
import { parseAhrefsCsv } from './parsers/ahrefs.ts';
import { parseSemrushCsv } from './parsers/semrush.ts';
import { parseSeRankingCsv } from './parsers/seranking.ts';

type ImportSource = 'ahrefs' | 'semrush' | 'seranking';

const VALID_SOURCES: readonly ImportSource[] = ['ahrefs', 'semrush', 'seranking'];

function normalizeSource(value: unknown): ImportSource {
  if (typeof value === 'string' && (VALID_SOURCES as readonly string[]).includes(value)) {
    return value as ImportSource;
  }
  return 'ahrefs';
}

function parseCsvForSource(source: ImportSource, buffer: ArrayBuffer): ParsedRow[] {
  if (source === 'semrush') return parseSemrushCsv(buffer);
  if (source === 'seranking') return parseSeRankingCsv(buffer);
  return parseAhrefsCsv(buffer);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    // 1) Lecture du form-data : token + fichier CSV.
    let token = '';
    let csvBuffer: ArrayBuffer | null = null;
    let providedDomain = '';
    let source: ImportSource = 'ahrefs';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      token = (form.get('token') || '').toString();
      providedDomain = (form.get('domain') || '').toString();
      source = normalizeSource((form.get('source') || 'ahrefs').toString());
      const csvFile = form.get('csv') as File | null;
      if (csvFile) csvBuffer = await csvFile.arrayBuffer();
    } else if (contentType.includes('application/json')) {
      // Fallback : token en JSON, CSV en base64.
      const body = await req.json();
      token = body.token || '';
      providedDomain = body.domain || '';
      source = normalizeSource(body.source);
      if (body.csv_base64) {
        csvBuffer = base64ToArrayBuffer(body.csv_base64);
      }
    }

    if (!token || !csvBuffer) {
      return jsonResponse({ error: 'token_and_csv_required' }, 400);
    }

    // 2) Client Supabase service role (bypass RLS).
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SB_SERVICE_ROLE_KEY')!,
    );

    // 3) Valide le token : pending + non expiré.
    const sessionQ = await supabase
      .from('import_sessions')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionQ.error || !sessionQ.data) {
      return jsonResponse({ error: 'invalid_or_expired_token' }, 401);
    }

    const session = sessionQ.data as {
      token: string;
      user_id: string;
      domain: string | null;
      existing_project_id: string | null;
    };
    const userId = session.user_id;
    const domain = providedDomain || session.domain || 'imported.local';
    const appendToProjectId = session.existing_project_id;

    // 4) Décode + parse le CSV selon la source.
    let rows: ParsedRow[];
    try {
      rows = parseCsvForSource(source, csvBuffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from('import_sessions')
        .update({ status: 'failed', error_message: `parse: ${msg}` })
        .eq('token', token);
      return jsonResponse({ error: 'parsing_failed', message: msg }, 400);
    }

    if (rows.length === 0) {
      await supabase
        .from('import_sessions')
        .update({ status: 'failed', error_message: 'empty_csv' })
        .eq('token', token);
      return jsonResponse({ error: 'empty_csv' }, 400);
    }

    console.log(`[extension-import] ${rows.length} rows parsed for user ${userId} (mode: ${appendToProjectId ? 'append' : 'new'})`);

    let projectId: string;

    if (appendToProjectId) {
      // ===== MODE APPEND =====
      // Vérifie que le projet existe et appartient au user.
      const projQ = await supabase
        .from('projects')
        .select('id, user_id')
        .eq('id', appendToProjectId)
        .maybeSingle();
      if (projQ.error || !projQ.data) {
        return jsonResponse({ error: 'project_not_found' }, 404);
      }
      if (projQ.data.user_id !== userId) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      projectId = appendToProjectId;

      // Ajoute le competitor si pas déjà présent (sinon update la couleur/label).
      const compQ = await supabase
        .from('competitors')
        .select('id')
        .eq('project_id', projectId)
        .eq('domain', domain)
        .maybeSingle();
      if (!compQ.data) {
        const { error } = await supabase.from('competitors').insert({
          id: crypto.randomUUID(),
          project_id: projectId,
          domain,
          label: domain,
          color: pickCompetitorColor(),
        });
        if (error) console.warn('[extension-import] competitor insert:', error.message);
      }

      // Pour un refresh propre : delete les positions existantes pour ce
      // source_domain dans ce projet, puis insert les nouvelles.
      // Étape 1 : récupérer les keyword_ids du projet
      const existingKwsQ = await supabase
        .from('keywords')
        .select('id, keyword')
        .eq('project_id', projectId);
      if (existingKwsQ.error) {
        return jsonResponse({ error: 'fetch_existing_kws_failed', message: existingKwsQ.error.message }, 500);
      }
      const existingKws = (existingKwsQ.data ?? []) as Array<{ id: string; keyword: string }>;

      // Map keyword_text (lowercase) → existing keyword.id pour merge.
      const textToId = new Map<string, string>();
      for (const k of existingKws) {
        textToId.set(k.keyword.trim().toLowerCase(), k.id);
      }

      // Delete les anciennes positions pour ce source_domain (chunked au cas où).
      if (existingKws.length > 0) {
        const allIds = existingKws.map((k) => k.id);
        for (const chunk of chunked(allIds, 200)) {
          await supabase
            .from('keyword_positions')
            .delete()
            .eq('source_domain', domain)
            .in('keyword_id', chunk);
        }
      }

      // Group nouveaux KWs par texte, on les merge avec les existants.
      const byText = new Map<string, ParsedRow[]>();
      for (const r of rows) {
        const k = r.keyword.trim().toLowerCase();
        if (!byText.has(k)) byText.set(k, []);
        byText.get(k)!.push(r);
      }

      const kwToInsert: Array<Record<string, unknown>> = [];
      const posToInsert: Array<Record<string, unknown>> = [];

      for (const [key, group] of byText) {
        let kwId = textToId.get(key);
        const first = group[0]!;
        if (!kwId) {
          // Nouveau KW jamais vu dans ce projet → INSERT
          kwId = crypto.randomUUID();
          textToId.set(key, kwId);
          kwToInsert.push({
            id: kwId,
            project_id: projectId,
            keyword: first.keyword,
            volume: maxOrNull(group.map((g) => g.volume)),
            kd: first.kd,
            cpc: first.cpc,
            intent: null,
            cluster_id: null,
            branded: null,
            traffic: null,
            serp_features: null,
          });
        }
        for (const r of group) {
          posToInsert.push({
            id: crypto.randomUUID(),
            keyword_id: kwId,
            source_domain: domain,
            position: r.position,
            url: r.url,
          });
        }
      }

      for (const chunk of chunked(kwToInsert, 500)) {
        const { error } = await supabase.from('keywords').insert(chunk);
        if (error) return jsonResponse({ error: 'kw_insert_failed', message: error.message }, 500);
      }
      for (const chunk of chunked(posToInsert, 500)) {
        const { error } = await supabase.from('keyword_positions').insert(chunk);
        if (error) return jsonResponse({ error: 'pos_insert_failed', message: error.message }, 500);
      }

      // Marque la session completed avec le project_id (réutilisé).
      await supabase
        .from('import_sessions')
        .update({
          status: 'completed',
          project_id: projectId,
          domain,
          source,
          completed_at: new Date().toISOString(),
        })
        .eq('token', token);

      return jsonResponse({
        ok: true,
        project_id: projectId,
        mode: 'append',
        keyword_count: kwToInsert.length,
        position_count: posToInsert.length,
      });
    }

    // ===== MODE NEW PROJECT =====
    projectId = crypto.randomUUID();
    {
      const { error } = await supabase.from('projects').insert({
        id: projectId,
        user_id: userId,
        name: `Import ${source} — ${domain}`,
        my_domain: domain,
        country: 'FR',
      });
      if (error) {
        return jsonResponse({ error: 'project_insert_failed', message: error.message }, 500);
      }
    }

    {
      const { error } = await supabase.from('competitors').insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        domain,
        label: domain,
        color: '#7c5cfc',
      });
      if (error) console.warn('[extension-import] competitor insert:', error.message);
    }

    const byText = new Map<string, ParsedRow[]>();
    for (const r of rows) {
      const k = r.keyword.trim().toLowerCase();
      if (!byText.has(k)) byText.set(k, []);
      byText.get(k)!.push(r);
    }

    const kwInserts: Array<Record<string, unknown>> = [];
    const posInserts: Array<Record<string, unknown>> = [];

    for (const [, group] of byText) {
      const kwId = crypto.randomUUID();
      const first = group[0]!;
      kwInserts.push({
        id: kwId,
        project_id: projectId,
        keyword: first.keyword,
        volume: maxOrNull(group.map((g) => g.volume)),
        kd: first.kd,
        cpc: first.cpc,
        intent: null,
        cluster_id: null,
        branded: null,
        traffic: null,
        serp_features: null,
      });
      for (const r of group) {
        posInserts.push({
          id: crypto.randomUUID(),
          keyword_id: kwId,
          source_domain: domain,
          position: r.position,
          url: r.url,
        });
      }
    }

    for (const chunk of chunked(kwInserts, 500)) {
      const { error } = await supabase.from('keywords').insert(chunk);
      if (error) {
        return jsonResponse({ error: 'kw_insert_failed', message: error.message }, 500);
      }
    }
    for (const chunk of chunked(posInserts, 500)) {
      const { error } = await supabase.from('keyword_positions').insert(chunk);
      if (error) {
        return jsonResponse({ error: 'pos_insert_failed', message: error.message }, 500);
      }
    }

    // 6) Marque la session completed.
    await supabase
      .from('import_sessions')
      .update({
        status: 'completed',
        project_id: projectId,
        domain,
        source,
        completed_at: new Date().toISOString(),
      })
      .eq('token', token);

    return jsonResponse({
      ok: true,
      project_id: projectId,
      keyword_count: kwInserts.length,
      position_count: posInserts.length,
    });
  } catch (e) {
    console.error('[extension-import] uncaught', e);
    return jsonResponse(
      { error: 'internal', message: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

// -----------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function maxOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length > 0 ? Math.max(...nums) : null;
}

function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

// Palette de couleurs pour les concurrents (random pick — l'user peut
// changer manuellement dans l'UI après).
const COMPETITOR_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
];
function pickCompetitorColor(): string {
  return COMPETITOR_COLORS[Math.floor(Math.random() * COMPETITOR_COLORS.length)]!;
}
