import Dexie, { type EntityTable } from 'dexie';

export type Intent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface Project {
  id: string;
  name: string;
  myDomain: string;
  country: string;
  createdAt: number;
  updatedAt: number;
}

export interface Competitor {
  id: string;
  projectId: string;
  domain: string;
  label: string;
  color: string;
  isMe: boolean;
}

export interface Keyword {
  id: string;
  projectId: string;
  keyword: string;
  volume: number;
  kd: number | null;
  cpc: number | null;
  intent: Intent[];
  clusterId: string | null;
  sourceDomain: string;
  position: number | null;
  url: string | null;
}

export interface Cluster {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
}

export interface ClusterCacheEntry {
  hash: string;
  projectId: string;
  payload: unknown;
  createdAt: number;
}

class GapVizDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  competitors!: EntityTable<Competitor, 'id'>;
  keywords!: EntityTable<Keyword, 'id'>;
  clusters!: EntityTable<Cluster, 'id'>;
  clusterCache!: EntityTable<ClusterCacheEntry, 'hash'>;

  constructor() {
    super('GapViz');
    this.version(1).stores({
      projects: 'id, name, createdAt',
      competitors: 'id, projectId, domain',
      keywords: 'id, projectId, keyword, clusterId, sourceDomain',
      clusters: 'id, projectId, parentId, name',
      clusterCache: 'hash, projectId, createdAt',
    });
  }
}

export const db = new GapVizDB();
