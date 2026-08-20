/**
 * The silhouette inside an anonymous guest's avatar.
 *
 * NOT `Icon.tsx`. That component is the product's icon set, keyed by name, and
 * every entry in it is a thing a player can press. This is a 12px glyph that
 * exists to fill a circle, it is drawn once, and adding it to the set would
 * imply a control that does not exist.
 *
 * `aria-hidden`, because the circle it sits in already carries the guest's
 * label as its `title` and the lineup list beneath names the same seat again.
 * A screen reader that announced this would read "Guest 2" three times.
 */
export function GuestIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="h-[55%] w-[55%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
