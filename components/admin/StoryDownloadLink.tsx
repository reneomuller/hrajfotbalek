import { strings } from "@/lib/strings";

/**
 * Downloads a game's 9:16 story image (round 42) — `/admin/games/<id>/story`.
 *
 * A plain `<a download>`, like the CSV exports beside it: the route answers
 * with an attachment, so the browser saves the PNG instead of navigating, and
 * no script is involved.
 */
export function StoryDownloadLink({
  gameId,
  testId,
  emphasis = false,
}: {
  gameId: string;
  testId: string;
  /** The just-published banner's filled button, rather than the quiet outline. */
  emphasis?: boolean;
}) {
  return (
    <a
      href={`/admin/games/${gameId}/story`}
      download
      data-testid={testId}
      className={
        emphasis
          ? "inline-flex min-h-11 shrink-0 items-center rounded-control border border-volt px-4 text-[13px] font-bold uppercase tracking-wide text-volt no-underline"
          : "inline-flex min-h-11 shrink-0 items-center rounded-control border border-hairline-strong px-4 text-[11px] uppercase tracking-[1px] text-muted no-underline transition hover:border-hairline-volt hover:text-volt"
      }
    >
      {strings.admin.storyDownload}
    </a>
  );
}
