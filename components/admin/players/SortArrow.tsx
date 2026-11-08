import type { SortDir } from "@/lib/admin/players/sort";

/**
 * Which way a sorted column runs, DRAWN rather than typed: a glyph whose shape
 * is the message may not be left to font fallback (CLAUDE.md — the `▾` that
 * rendered as a dot). Two strokes, the same everywhere.
 */
export function SortArrow({ dir }: { dir: SortDir }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={`h-2.5 w-2.5 shrink-0 ${dir === "desc" ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6.5 5 3.5 8 6.5" />
    </svg>
  );
}
