export const PALETTE: readonly string[] = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f97316', // orange
  '#a855f7', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#84cc16', // lime
  '#818cf8', // indigo
];

export const MY_SITE_COLOR = PALETTE[0]!;

export function pickNextColor(used: string[]): string {
  for (const c of PALETTE) {
    if (!used.includes(c)) return c;
  }
  return PALETTE[0]!;
}
