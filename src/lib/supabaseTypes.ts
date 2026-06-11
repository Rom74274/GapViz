// Types qui matchent le schéma Supabase (cf. brief Étape 1c).
// Les noms de colonnes sont en snake_case côté DB ; on garde la même
// convention ici pour éviter les translations à chaque lecture/écriture.
//
// IMPORTANT : on utilise `type` (pas `interface`) pour ces Row types.
// Les interfaces n'ont pas d'index signature implicite et n'étendent
// donc pas `Record<string, unknown>` — ce qui casse la contrainte
// `GenericTable` de @supabase/supabase-js et fait résoudre les
// paramètres .insert() / .update() à `never`.

export type UserPlan = 'free' | 'pro' | 'agency';

export type SupabaseProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: UserPlan;
  plan_expires_at: string | null;
  // Compteur clustering du mois courant. Reset rolling 30j via
  // clusterings_reset_at. Cf. étape 2 du brief SaaS.
  clusterings_used: number;
  clusterings_reset_at: string;
  // Stripe — ajoutés à l'étape 4 (Stripe checkout + webhook).
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SupabaseProject = {
  id: string;
  user_id: string;
  name: string;
  my_domain: string;
  country: string;
  created_at: string;
  updated_at: string;
};

export type SupabaseCompetitor = {
  id: string;
  project_id: string;
  domain: string;
  label: string | null;
  color: string;
};

export type SupabaseKeyword = {
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
};

export type SupabaseKeywordPosition = {
  id: string;
  keyword_id: string;
  source_domain: string;
  position: number | null;
  url: string | null;
};

export type SupabaseCluster = {
  id: string;
  project_id: string;
  name: string;
  parent_id: string | null;
  is_noise: boolean;
  excluded: boolean;
};

export type ImportSessionStatus = 'pending' | 'completed' | 'failed' | 'expired';

export type SupabaseImportSession = {
  token: string;
  user_id: string;
  status: ImportSessionStatus;
  project_id: string | null;
  domain: string | null;
  source: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
};

// Type "Database" attendu par @supabase/supabase-js v2 :
//   - Tables doivent avoir Row / Insert / Update / Relationships
//   - Schema doit aussi déclarer Views / Functions (vide ici)
// Sans ces clés, le client résout les paramètres .insert() / .update() à `never`.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: SupabaseProfile;
        Insert: Partial<SupabaseProfile> & { id: string };
        Update: Partial<SupabaseProfile>;
        Relationships: [];
      };
      projects: {
        Row: SupabaseProject;
        // user_id est rempli côté serveur via default auth.uid() — optionnel ici.
        Insert: Omit<SupabaseProject, 'id' | 'user_id' | 'created_at' | 'updated_at'> & {
          id?: string;
          user_id?: string;
        };
        Update: Partial<SupabaseProject>;
        Relationships: [];
      };
      competitors: {
        Row: SupabaseCompetitor;
        Insert: Omit<SupabaseCompetitor, 'id'> & { id?: string };
        Update: Partial<SupabaseCompetitor>;
        Relationships: [];
      };
      keywords: {
        Row: SupabaseKeyword;
        Insert: Omit<SupabaseKeyword, 'id'> & { id?: string };
        Update: Partial<SupabaseKeyword>;
        Relationships: [];
      };
      keyword_positions: {
        Row: SupabaseKeywordPosition;
        Insert: Omit<SupabaseKeywordPosition, 'id'> & { id?: string };
        Update: Partial<SupabaseKeywordPosition>;
        Relationships: [];
      };
      clusters: {
        Row: SupabaseCluster;
        Insert: Omit<SupabaseCluster, 'id'> & { id?: string };
        Update: Partial<SupabaseCluster>;
        Relationships: [];
      };
      import_sessions: {
        Row: SupabaseImportSession;
        // token, user_id obligatoires ; tout le reste a des defaults DB.
        Insert: {
          token?: string;
          user_id: string;
          status?: ImportSessionStatus;
          project_id?: string | null;
          domain?: string | null;
          source?: string | null;
          error_message?: string | null;
          expires_at?: string;
        };
        Update: Partial<SupabaseImportSession>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
