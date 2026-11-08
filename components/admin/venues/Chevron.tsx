/**
 * The disclosure cue on a venue row and on the archive, DRAWN rather than
 * typed — CLAUDE.md's glyph rule: `▾` renders as a dot in several fallback
 * faces on this type stack, and this page's venue rows were named as the next
 * place it would. Turns with the `<details className="group">` around it.
 */
export function Chevron({ testId }: { testId?: string }) {
  return (
    <svg
      aria-hidden
      data-testid={testId}
      viewBox="0 0 12 8"
      className="h-2 w-3 shrink-0 text-muted transition-transform group-open:rotate-180"
    >
      <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
