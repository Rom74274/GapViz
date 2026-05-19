import type { UserPlan } from '@/lib/supabaseTypes';

// ---------------------------------------------------------------------------
// Définition centrale des limites par plan (Étape 2 du brief SaaS).
// `null` = illimité.
// ---------------------------------------------------------------------------

export interface PlanLimits {
  maxProjects: number | null;
  maxKeywordsPerProject: number | null;
  maxCompetitorsPerProject: number | null;
  maxClusteringsPerMonth: number | null;
  // null = illimité ; nombre = blur après cette ligne dans KeywordTable
  tableRowsVisible: number | null;
  csvExport: boolean;
  // Cosmétique : watermark "Star Gap Free" visible sur le graph
  watermark: boolean;
}

export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  free: {
    maxProjects: 1,
    maxKeywordsPerProject: 500,
    maxCompetitorsPerProject: 3,
    maxClusteringsPerMonth: 2, // illimité si BYOK — cf. canRunClustering
    tableRowsVisible: 20,
    csvExport: false,
    watermark: true,
  },
  pro: {
    maxProjects: 5,
    maxKeywordsPerProject: 5_000,
    maxCompetitorsPerProject: 10,
    maxClusteringsPerMonth: 20,
    tableRowsVisible: null,
    csvExport: true,
    watermark: false,
  },
  agency: {
    maxProjects: null,
    maxKeywordsPerProject: null,
    maxCompetitorsPerProject: null,
    maxClusteringsPerMonth: null,
    tableRowsVisible: null,
    csvExport: true,
    watermark: false,
  },
};

export const PLAN_LABELS: Record<UserPlan, string> = {
  free: 'Free',
  pro: 'Pro',
  agency: 'Agency',
};

// ---------------------------------------------------------------------------
// Helpers de vérification de limites. Renvoient un résultat structuré pour
// alimenter l'UpgradeModal (raison + plan minimum requis).
// ---------------------------------------------------------------------------

export type LimitReason =
  | 'max_projects'
  | 'max_keywords'
  | 'max_competitors'
  | 'max_clusterings'
  | 'csv_export'
  | 'table_truncated'
  | 'no_api_key';

export interface LimitResult {
  allowed: boolean;
  reason?: LimitReason;
  limit?: number | null;
  current?: number;
  suggestedPlan?: UserPlan;
  message?: string;
}

const allowed: LimitResult = { allowed: true };

// Cherche le plan minimum qui satisfait une condition donnée.
function nextPlanWith(
  current: UserPlan,
  pred: (l: PlanLimits) => boolean,
): UserPlan | undefined {
  const order: UserPlan[] = ['free', 'pro', 'agency'];
  const start = order.indexOf(current) + 1;
  for (let i = start; i < order.length; i++) {
    if (pred(PLAN_LIMITS[order[i]!])) return order[i]!;
  }
  return undefined;
}

export function checkMaxProjects(plan: UserPlan, currentCount: number): LimitResult {
  const limit = PLAN_LIMITS[plan].maxProjects;
  if (limit === null || currentCount < limit) return allowed;
  return {
    allowed: false,
    reason: 'max_projects',
    limit,
    current: currentCount,
    suggestedPlan: nextPlanWith(plan, (l) => l.maxProjects === null || l.maxProjects > limit),
    message: `Ton plan ${PLAN_LABELS[plan]} est limité à ${limit} projet${limit > 1 ? 's' : ''}.`,
  };
}

export function checkMaxKeywords(
  plan: UserPlan,
  currentCount: number,
  incoming = 0,
): LimitResult {
  const limit = PLAN_LIMITS[plan].maxKeywordsPerProject;
  if (limit === null || currentCount + incoming <= limit) return allowed;
  return {
    allowed: false,
    reason: 'max_keywords',
    limit,
    current: currentCount + incoming,
    suggestedPlan: nextPlanWith(plan, (l) => l.maxKeywordsPerProject === null || l.maxKeywordsPerProject > limit),
    message: `Ton plan ${PLAN_LABELS[plan]} est limité à ${limit.toLocaleString('fr-FR')} mots-clés par projet.`,
  };
}

export function checkMaxCompetitors(plan: UserPlan, currentCount: number): LimitResult {
  const limit = PLAN_LIMITS[plan].maxCompetitorsPerProject;
  if (limit === null || currentCount < limit) return allowed;
  return {
    allowed: false,
    reason: 'max_competitors',
    limit,
    current: currentCount,
    suggestedPlan: nextPlanWith(plan, (l) => l.maxCompetitorsPerProject === null || l.maxCompetitorsPerProject > limit),
    message: `Ton plan ${PLAN_LABELS[plan]} est limité à ${limit} concurrent${limit > 1 ? 's' : ''} par projet.`,
  };
}

// Pour le clustering, on a deux cas :
//   - BYOK (l'user a sa propre clé API) → illimité tant qu'on n'a pas
//     d'edge function managée. Tous les coûts sont sur sa clé.
//   - Pas de BYOK → on devrait passer par l'edge function (étape 3),
//     comptée contre `clusterings_used`. Pas encore implémenté, donc on
//     refuse avec un CTA "ajoute ta clé API".
export function checkRunClustering(
  plan: UserPlan,
  hasOwnApiKey: boolean,
  clusteringsUsed: number,
): LimitResult {
  if (hasOwnApiKey) return allowed;

  // Pas de BYOK : on est en mode "clustering managé" (= edge function future).
  // En attendant l'étape 3, on refuse explicitement.
  const limit = PLAN_LIMITS[plan].maxClusteringsPerMonth;
  if (limit === null) {
    return {
      allowed: false,
      reason: 'no_api_key',
      message:
        'Le clustering managé arrive bientôt. En attendant, ajoute ta clé Claude API dans Settings.',
    };
  }
  if (clusteringsUsed >= limit) {
    return {
      allowed: false,
      reason: 'max_clusterings',
      limit,
      current: clusteringsUsed,
      suggestedPlan: nextPlanWith(plan, (l) => l.maxClusteringsPerMonth === null || (l.maxClusteringsPerMonth ?? 0) > limit),
      message: `Ton plan ${PLAN_LABELS[plan]} permet ${limit} clustering${limit > 1 ? 's' : ''} managé${limit > 1 ? 's' : ''} par mois. Ajoute ta clé Claude pour rester illimité.`,
    };
  }
  // Quota dispo mais edge function pas encore là.
  return {
    allowed: false,
    reason: 'no_api_key',
    message:
      'Le clustering managé arrive bientôt. En attendant, ajoute ta clé Claude API dans Settings.',
  };
}

export function checkCsvExport(plan: UserPlan): LimitResult {
  if (PLAN_LIMITS[plan].csvExport) return allowed;
  return {
    allowed: false,
    reason: 'csv_export',
    suggestedPlan: nextPlanWith(plan, (l) => l.csvExport),
    message: `L'export CSV est réservé aux plans Pro et Agency.`,
  };
}

// Reset rolling 30 jours du compteur clustering. Renvoie `true` si le
// compteur doit être remis à zéro (l'appelant fait l'UPDATE Supabase).
export function shouldResetClusteringsCount(resetAt: string | null): boolean {
  if (!resetAt) return true;
  const last = new Date(resetAt).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= 30 * 24 * 60 * 60 * 1000;
}
