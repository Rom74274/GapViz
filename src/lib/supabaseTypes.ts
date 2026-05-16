// Types qui matchent le schéma Supabase (cf. brief Étape 1c).
// Les noms de colonnes sont en snake_case côté DB ; on garde la même
// convention ici pour éviter les translations à chaque lecture/écriture.

export type UserPlan = 'free' | 'pro' | 'agency';

export interface SupabaseProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: UserPlan;
  plan_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProject {
  id: string;
  user_id: string;
  name: string;
  my_domain: string;
  country: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseCompetitor {
  id: string;
  project_id: string;
  domain: string;
  label: string | null;
  color: string;
}

export interface SupabaseKeyword {
  id: string;
  project_id: string;
  keyword: string;
  volume: number | null;
  kd: number | null;
  cpc: number | null;
  intent: string[] | null;
  cluster_id: string | null;
  branded: boolean | null;
  traffic: number | null;
  serp_features: string | null;
}

export interface SupabaseKeywordPosition {
  id: string;
  keyword_id: string;
  source_domain: string;
  position: number | null;
  url: string | null;
}

export interface SupabaseCluster {
  id: string;
  project_id: string;
  name: string;
  parent_id: string | null;
  is_noise: boolean;
  excluded: boolean;
}

// Type "Database" attendu par @supabase/supabase-js pour le typage des
// requêtes. On expose un sous-ensemble — les `Insert`/`Update` partiels
// laissent Supabase gérer les defaults (id, timestamps).

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: SupabaseProfile;
        Insert: Partial<SupabaseProfile> & { id: string };
        Update: Partial<SupabaseProfile>;
      };
      projects: {
        Row: SupabaseProject;
        Insert: Omit<SupabaseProject, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<SupabaseProject>;
      };
      competitors: {
        Row: SupabaseCompetitor;
        Insert: Omit<SupabaseCompetitor, 'id'> & { id?: string };
        Update: Partial<SupabaseCompetitor>;
      };
      keywords: {
        Row: SupabaseKeyword;
        Insert: Omit<SupabaseKeyword, 'id'> & { id?: string };
        Update: Partial<SupabaseKeyword>;
      };
      keyword_positions: {
        Row: SupabaseKeywordPosition;
        Insert: Omit<SupabaseKeywordPosition, 'id'> & { id?: string };
        Update: Partial<SupabaseKeywordPosition>;
      };
      clusters: {
        Row: SupabaseCluster;
        Insert: Omit<SupabaseCluster, 'id'> & { id?: string };
        Update: Partial<SupabaseCluster>;
      };
    };
  };
}
