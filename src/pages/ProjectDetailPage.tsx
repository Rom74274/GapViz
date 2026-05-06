import { useParams } from 'react-router-dom';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Projet</h1>
      <p className="mt-2 font-mono text-sm text-text-muted">{projectId}</p>
      <div className="mt-8 rounded-lg border border-dashed border-border-subtle p-8 text-center text-text-muted">
        Le graph apparaîtra ici une fois le clustering terminé.
      </div>
    </div>
  );
}
