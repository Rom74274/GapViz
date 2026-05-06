import type { ParsedRow } from '@/lib/parsers';

interface KeywordPreviewTableProps {
  rows: ParsedRow[];
  limit?: number;
}

export function KeywordPreviewTable({ rows, limit = 10 }: KeywordPreviewTableProps) {
  const head = rows.slice(0, limit);
  const remaining = rows.length - head.length;

  if (rows.length === 0) {
    return (
      <p className="text-xs text-text-muted px-1 py-2">Aucune ligne valide.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle">
      <table className="w-full text-xs">
        <thead className="bg-bg-elevated text-text-secondary">
          <tr>
            <th className="text-left px-3 py-1.5 font-medium">Keyword</th>
            <th className="text-right px-3 py-1.5 font-medium font-mono">Vol</th>
            <th className="text-right px-3 py-1.5 font-medium font-mono">Pos</th>
            <th className="text-right px-3 py-1.5 font-medium font-mono">KD</th>
            <th className="text-left px-3 py-1.5 font-medium">Intent</th>
          </tr>
        </thead>
        <tbody>
          {head.map((r, i) => (
            <tr key={i} className="border-t border-border-subtle">
              <td className="px-3 py-1.5 truncate max-w-[200px]">{r.keyword}</td>
              <td className="px-3 py-1.5 text-right font-mono text-text-secondary">
                {r.volume.toLocaleString('fr-FR')}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-text-secondary">
                {r.position ?? '—'}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-text-secondary">
                {r.kd ?? '—'}
              </td>
              <td className="px-3 py-1.5 text-text-muted">
                {r.intent.length > 0 ? r.intent.map(abbrev).join(', ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 && (
        <p className="border-t border-border-subtle bg-bg-elevated/50 px-3 py-1.5 text-xs text-text-muted">
          + {remaining} autre{remaining > 1 ? 's' : ''} mot{remaining > 1 ? 's' : ''}-clé{remaining > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

function abbrev(i: string): string {
  return i.charAt(0).toUpperCase() + i.charAt(1);
}
