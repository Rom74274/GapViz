export function ProjectsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Projets</h1>
      <p className="mt-2 text-text-secondary">
        Liste et création de projets — à venir dans la prochaine itération.
      </p>
      <div className="mt-8 rounded-lg border border-dashed border-border-subtle p-8 text-center text-text-muted">
        Aucun projet pour l'instant.
      </div>
    </div>
  );
}
