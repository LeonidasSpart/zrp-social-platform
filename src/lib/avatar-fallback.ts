// Pure logic behind src/components/ui/avatar.tsx's fallback rendering,
// split into its own plain .ts module so it's importable from a Vitest
// unit test without a JSX transform - this repo's vitest.config.ts has no
// @vitejs/plugin-react (every other test here is API-route logic, never a
// component import), and adding one just to cover two pure functions
// would be a heavier dependency than the thing being tested warrants.

// Small, fixed palette so the same name always maps to the same color
// (deterministic, no randomness) without needing a design-token import
// here - matches the muted, readable style used elsewhere in the app.
const PALETTE = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#10B981",
  "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#EC4899",
];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
