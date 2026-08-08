"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/Toast";

/**
 * Copy link — the PRIMARY share action (§5.4, REQ-GAME-014).
 *
 * Primary because a copied link goes wherever the sender is already talking,
 * and that is not always WhatsApp. The WhatsApp button stays beside it as the
 * secondary, because the group this product replaced is still where a game
 * actually gets filled.
 *
 * CLIENT-SIDE, AND THEREFORE ITS OWN TOAST. Every other toast in the product
 * crosses a navigation and arrives through the URL; this one does not — there
 * is nowhere to navigate to, the whole event is "the string is now on your
 * clipboard". So this mounts the same shared `Toast` component directly rather
 * than inventing a second notification mechanism for one case.
 *
 * `navigator.clipboard` NEEDS A SECURE CONTEXT and is absent on plain HTTP and
 * in some in-app browsers — exactly the WhatsApp/Instagram webviews this
 * product's links travel through. The fallback selects the URL in a temporary
 * input and uses `document.execCommand("copy")`, which is deprecated and still
 * the only thing that works there. If both fail the button says so rather than
 * claiming a success it did not have: a silent no-op here means someone pastes
 * whatever was on the clipboard before.
 */
export function CopyLinkButton({
  url,
  label,
  copiedMessage,
  failedMessage,
  closeLabel,
  size = "default",
}: {
  url: string;
  label: string;
  copiedMessage: string;
  failedMessage: string;
  closeLabel: string;
  size?: "default" | "slim";
}) {
  const [toast, setToast] = useState<string | null>(null);

  // Cleared so a second copy re-fires the toast rather than being swallowed as
  // "the message has not changed".
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function copy() {
    setToast(null);

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setToast(copiedMessage);
        return;
      } catch {
        // Permission refused, or a context that lied about having the API.
        // Fall through to the legacy path rather than giving up here.
      }
    }

    setToast(legacyCopy(url) ? copiedMessage : failedMessage);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        data-testid="share-copy-link"className={`inline-flex items-center gap-2 rounded-control border border-hairline-volt bg-volt/[.08] px-3 py-2 uppercase tracking-eyebrow text-volt transition hover:border-hairline-volt ${ size ==="slim" ? "text-[9px]" : "text-[10px]"
        }`}
      >
        <span aria-hidden>⧉</span>
        {label}
      </button>

      <Toast message={toast} closeLabel={closeLabel} />
    </>
  );
}

/**
 * The pre-Clipboard-API copy, for the in-app browsers that still need it.
 *
 * `readonly` and an off-screen position rather than `display:none`: a hidden
 * element cannot be selected, and a focused input at the top of the page
 * scrolls the reader away from what they were looking at.
 */
function legacyCopy(text: string): boolean {
  try {
    const input = document.createElement("input");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.top = "-1000px";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(input);
    return ok;
  } catch {
    return false;
  }
}
