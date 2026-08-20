import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

/**
 * The Google button and the "or" divider beneath it (p08, p09).
 *
 * ONE COMPONENT FOR BOTH so the gate is in ONE place. The divider has to
 * disappear with the button — an unflagged deployment showing a rule with the
 * word "or" above the email form and nothing on the other side of it is worse
 * than either piece alone, and that is exactly what two independently gated
 * elements produce the first time someone edits one of them.
 *
 * A SERVER COMPONENT wrapping a client one: the strings resolve on the server
 * with everything else on the page, and only the button — which needs a click
 * handler and the browser Supabase client — crosses the boundary.
 */
export function GoogleAuthBlock({
  label,
  orLabel,
  gameId = null,
  action = "login",
  next = null,
}: {
  label: string;
  orLabel: string;
  gameId?: string | null;
  action?: string;
  next?: string | null;
}) {
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH !== "1") return null;

  return (
    <div className="mt-6" data-testid="google-auth-block">
      <GoogleAuthButton label={label} gameId={gameId} action={action} next={next} />

      {/* A rule with the word centred on it, which is how both frames draw it. */}
      <div className="mt-5 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-hairline-strong" />
        <span className="text-eyebrow font-semibold uppercase text-muted">{orLabel}</span>
        <span className="h-px flex-1 bg-hairline-strong" />
      </div>
    </div>
  );
}
