"use client";

/**
 * The last boundary (audit F4).
 *
 * `app/error.tsx` cannot catch a failure in the ROOT LAYOUT — the layout is
 * what renders the boundary — so a crash in the header, the fonts, the locale
 * provider or the background would still blank the page. This one replaces
 * `<html>` itself, which is why it declares its own document.
 *
 * INLINE STYLES, DELIBERATELY, and the one place in this product where that is
 * right: if the root layout failed, the stylesheet it links may be exactly
 * what failed. A boundary that depends on the thing it is catching is not a
 * boundary. The colours are the tokens' values written out, because
 * `tailwind.config.ts` is not available to a document that never got one.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0A0A0A",
          color: "#EDEDED",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "22px",
        }}
      >
        <div data-testid="global-error" style={{ maxWidth: "420px" }}>
          <h1 style={{ fontSize: "24px", margin: 0, textTransform: "uppercase" }}>
            Hraj Fotbal is having a moment
          </h1>
          <p style={{ fontSize: "15px", lineHeight: 1.5, color: "#B8B8B8" }}>
            Something broke before the page could load. Reloading usually fixes
            it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "44px",
              padding: "0 20px",
              borderRadius: "14px",
              border: "none",
              background: "#C8FF00",
              color: "#0A0A0A",
              fontSize: "17px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ fontSize: "13px", color: "#6E6E6E", marginTop: "24px" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
