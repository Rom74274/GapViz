import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';
import { shouldResetClusteringsCount } from '@/lib/plans';

// ---------------------------------------------------------------------------
// Maintenance du compteur clustering en Supabase (profiles.clusterings_used
// + profiles.clusterings_reset_at). Cf. étape 2 du brief SaaS.
//
// Pattern : on incrémente à CHAQUE clustering réussi (qu'il soit BYOK ou
// managé). Le compteur sert à la fois de stat et de gate. La gate
// (checkRunClustering) ne s'enclenche qu'en mode managé — en BYOK,
// l'utilisateur paie sa propre clé Claude, donc on ne plafonne pas.
//
// Le reset rolling 30j est appliqué à l'incrément : si la dernière reset
// date de plus de 30 jours, on repart à 1 (= ce clustering) avec un
// nouveau reset_at = now().
// ---------------------------------------------------------------------------

export async function incrementClusteringsUsed(): Promise<void> {
  const profile = useAuthStore.getState().profile;
  if (!profile) {
    console.warn('[usage] no profile loaded — increment skipped');
    return;
  }

  const stale = shouldResetClusteringsCount(profile.clusterings_reset_at);
  const nextCount = stale ? 1 : profile.clusterings_used + 1;
  const nextResetAt = stale ? new Date().toISOString() : profile.clusterings_reset_at;

  const { error } = await supabase
    .from('profiles')
    .update({
      clusterings_used: nextCount,
      clusterings_reset_at: nextResetAt,
    })
    .eq('id', profile.id);
  if (error) {
    console.error('[usage] increment clusterings_used failed', error);
    return;
  }

  // Recharge le profile dans le store pour que l'UI voit le nouveau compteur.
  await useAuthStore.getState().reloadProfile();
}
