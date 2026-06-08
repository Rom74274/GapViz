// ---------------------------------------------------------------------------
// Autofill domaine : prend ce que l'utilisateur tape, slugifie, et vérifie
// en parallèle si les TLDs courants existent vraiment via Google DNS API
// (DoH — DNS over HTTPS, gratuit, public, sans CORS).
// ---------------------------------------------------------------------------

const COMMON_TLDS = ['io', 'com', 'fr', 'co', 'net', 'app'];

const DNS_ENDPOINT = 'https://dns.google/resolve';

// Slugifie un texte pour en faire un candidat de domaine.
// "Skello FR" → "skello", "L'oréal" → "loreal", "Air France" → "airfrance".
export function slugifyForDomain(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove accents
    .replace(/[^a-z0-9]/g, '') // keep only alphanum
    .slice(0, 30);
}

// Si l'utilisateur a déjà tapé un domaine complet (contient un point), on
// extrait le stem (= partie avant le TLD).
export function extractStem(input: string): string {
  const trimmed = input.trim().toLowerCase();
  // Si déjà un domaine type "foo.io", on prend "foo".
  if (trimmed.includes('.')) {
    const stem = trimmed.split('.')[0]!;
    return slugifyForDomain(stem);
  }
  return slugifyForDomain(trimmed);
}

interface DnsResponse {
  Status: number;
  Answer?: Array<{ data: string }>;
}

// Vérifie si un domaine a des A records (donc existe et est routé).
async function domainExists(domain: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${DNS_ENDPOINT}?name=${encodeURIComponent(domain)}&type=A`, {
      signal,
      headers: { Accept: 'application/dns-json' },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as DnsResponse;
    return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
  } catch {
    return false;
  }
}

// Pour un stem donné, vérifie en parallèle les TLDs courants et retourne
// la liste des domaines qui existent. Ordre : .io, .com, .fr, .co, .net, .app.
export async function suggestDomains(
  rawInput: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const stem = extractStem(rawInput);
  if (stem.length < 2) return [];

  const candidates = COMMON_TLDS.map((tld) => `${stem}.${tld}`);
  const checks = await Promise.all(
    candidates.map(async (d) => ((await domainExists(d, signal)) ? d : null)),
  );
  return checks.filter((d): d is string => d !== null);
}

// URL du favicon Google (gratuit, pas de CORS, fallback gris si pas trouvé).
export function faviconUrl(domain: string, size = 32): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
