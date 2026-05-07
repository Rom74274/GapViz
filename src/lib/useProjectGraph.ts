import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Cluster, type Competitor, type Keyword, type Project } from './db';
import { buildGraph, type BuiltGraph } from '@/components/graph/graphLayout';

export interface ProjectGraphData {
  graph: BuiltGraph | null;
  project: Project | undefined;
  keywords: Keyword[] | undefined;
  competitors: Competitor[] | undefined;
  clusters: Cluster[] | undefined;
}

export function useProjectGraph(projectId: string): ProjectGraphData {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const keywords = useLiveQuery(
    () => db.keywords.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const competitors = useLiveQuery(
    () => db.competitors.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const clusters = useLiveQuery(
    () => db.clusters.where('projectId').equals(projectId).toArray(),
    [projectId],
  );

  const graph = useMemo<BuiltGraph | null>(() => {
    if (!keywords || !competitors || !clusters || !project) return null;
    return buildGraph({
      keywords,
      competitors,
      clusters,
      myDomain: project.myDomain,
      projectName: project.name,
    });
  }, [keywords, competitors, clusters, project]);

  return { graph, project, keywords, competitors, clusters };
}
