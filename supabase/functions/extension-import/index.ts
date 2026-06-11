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

interface ParsedRow {
  keyword: string;
  volume: number | null;
  position: number | null;
  kd: number | null;
  cpc: number | null;
  url: string | null;
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
    let source = 'ahrefs';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      token = (form.get('token') || '').toString();
      providedDomain = (form.get('domain') || '').toString();
      source = (form.get('source') || 'ahrefs').toString();
      const csvFile = form.get('csv') as File | null;
      if (csvFile) csvBuffer = await csvFile.arrayBuffer();
    } else if (contentType.includes('application/json')) {
      // Fallback : token en JSON, CSV en base64.
      const body = await req.json();
      token = body.token || '';
      providedDomain = body.domain || '';
      source = body.source || 'ahrefs';
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
    };
    const userId = session.user_id;
    const domain = providedDomain || session.domain || 'imported.local';

    // 4) Décode + parse le CSV Ahrefs.
    const csvText = decodeAhrefsCsv(csvBuffer);
    let rows: ParsedRow[];
    try {
      rows = parseAhrefsCsv(csvText);
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

    console.log(`[extension-import] ${rows.length} rows parsed for user ${userId}`);

    // 5) Crée le projet + insère les KWs.
    const projectId = crypto.randomUUID();
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

    // Compétiteur "moi" pour cohérence avec la forme normale d'un projet.
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

    // Group KWs by text (1 keyword row + 1 position row par groupe).
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

    // Insert chunked (500 par batch — limite payload Supabase ~1MB).
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

// -----------------------------------------------------------------------------
// CSV Ahrefs : encoding UTF-16 LE (avec BOM) le plus souvent, séparateur tab.
// Detection BOM → décode dans le bon encodage, sinon UTF-8.
// -----------------------------------------------------------------------------

function decodeAhrefsCsv(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function parseAhrefsCsv(text: string): ParsedRow[] {
  // Strip BOM résiduel.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Détecte séparateur sur la 1ère ligne, AVANT de tokenize les guillemets.
  // (suffit, Ahrefs ne mélange pas tab et virgule sur la même ligne).
  const firstNl = text.search(/\r?\n/);
  const firstLine = firstNl > 0 ? text.slice(0, firstNl) : text;
  const sep = firstLine.includes('\t') ? '\t' : ',';

  const allRows = parseCsvText(text, sep);
  if (allRows.length < 2) throw new Error('CSV trop court (manque headers ou données)');

  const headers = allRows[0]!.map((h) => h.toLowerCase().trim());

  const colIndex = (...candidates: string[]): number => {
    // Match exact d'abord, puis fuzzy (includes) en fallback.
    for (const c of candidates) {
      const lc = c.toLowerCase();
      const exact = headers.findIndex((h) => h === lc);
      if (exact >= 0) return exact;
    }
    for (const c of candidates) {
      const lc = c.toLowerCase();
      const fuzzy = headers.findIndex((h) => h.includes(lc));
      if (fuzzy >= 0) return fuzzy;
    }
    return -1;
  };

  const iKeyword = colIndex('keyword');
  const iVolume = colIndex('volume', 'search volume');
  const iPosition = colIndex('current position', 'position');
  const iKd = colIndex('kd', 'keyword difficulty', 'difficulty');
  const iCpc = colIndex('cpc');
  const iUrl = colIndex('current url', 'url');

  if (iKeyword < 0) {
    throw new Error('Colonne "Keyword" introuvable dans les headers : ' + headers.join(' | '));
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const cells = allRows[i]!;
    const keyword = (cells[iKeyword] || '').trim();
    if (!keyword) continue;

    // Clamping défensif : position ∈ [1, 1000], kd ∈ [0, 100].
    // Si une valeur dépasse, c'est qu'on a un mauvais mapping → on null
    // pour éviter de polluer la DB.
    const rawPos = iPosition >= 0 ? parseNum(cells[iPosition]) : null;
    const position = rawPos !== null && (rawPos < 1 || rawPos > 1000) ? null : rawPos;

    const rawKd = iKd >= 0 ? parseNum(cells[iKd]) : null;
    const kd = rawKd !== null && (rawKd < 0 || rawKd > 100) ? null : rawKd;

    rows.push({
      keyword,
      volume: iVolume >= 0 ? parseNum(cells[iVolume]) : null,
      position,
      kd,
      cpc: iCpc >= 0 ? parseNum(cells[iCpc]) : null,
      url: iUrl >= 0 ? (cells[iUrl] || '').trim() || null : null,
    });
  }
  return rows;
}

// Vrai parser CSV qui respecte les guillemets (RFC 4180-like).
// Gère :
//   - Champs entre guillemets `"..."` qui peuvent contenir le séparateur
//   - Guillemets échappés `""` → `"`
//   - CRLF / LF / CR comme line ending
//   - Champs multilignes (un `"..."` peut contenir des newlines)
function parseCsvText(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const N = text.length;

  while (i < N) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    // Hors quotes :
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === sep) {
      row.push(current);
      current = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(current);
      current = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      // Skip CRLF en 1 fois
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }
    current += ch;
    i++;
  }
  // Push dernière cellule + ligne si non terminée par newline.
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$%]/g, '').replace(/\s+/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function maxOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length > 0 ? Math.max(...nums) : null;
}

function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
