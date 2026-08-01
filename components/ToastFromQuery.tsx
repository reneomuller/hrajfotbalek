import { Toast } from "@/components/Toast";
import { getStrings } from "@/lib/i18n/server";
import { readToast, type ToastKind } from "@/lib/ux/toast";

/**
 * Resolves a toast kind from the URL and renders it in the reader's language.
 *
 * THE SERVER SIDE OF THE SEAM. Most of these toasts fire across a navigation:
 * the request that books a spot and the request that renders the page saying
 * so are different requests, so the acting side puts a KIND in the URL and
 * this resolves it to copy here, where `getStrings()` already knows the
 * locale. Passing the finished sentence through the URL instead would ship
 * English to a Czech reader — and would let anyone put any text on the page by
 * editing a query string.
 *
 * An unrecognised kind renders nothing at all, which is what a stale or
 * hand-edited link should produce.
 */
export async function ToastFromQuery({
  query,
}: {
  query: Record<string, string | string[] | undefined>;
}) {
  const t = await getStrings();
  const kind = readToast(query);

  return (
    <Toast
      message={kind ? messageFor(kind, t) : null}
      closeLabel={t.common.dismiss}
    />
  );
}

function messageFor(kind: ToastKind, t: Awaited<ReturnType<typeof getStrings>>): string {
  switch (kind) {
    case "bookingCreated":
      return t.toast.bookingCreated;
    case "signedIn":
      return t.toast.signedIn;
    case "bookingCancelled":
      return t.toast.bookingCancelled;
    case "topupConfirmed":
      return t.toast.topupConfirmed;
    case "linkCopied":
      return t.toast.linkCopied;
  }
}
