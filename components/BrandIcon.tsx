/**
 * The WhatsApp and Instagram marks, as real glyphs.
 *
 * WHAT THEY REPLACE: a `bg-whatsapp` circle and a `bg-instagram` rounded
 * square. Two coloured blobs beside two words, which asked the reader to take
 * "the green dot means WhatsApp" on trust. The whole reason to put a brand mark
 * on a button is that it is recognised before the label is read, and a swatch
 * is recognised as nothing.
 *
 * INLINE SVG, NOT A FONT OR A REMOTE FILE. These are two paths; a request for
 * them would be a request the page waits on, and an icon font would be a
 * download for two glyphs. `currentColor` is deliberately NOT used — a brand
 * mark in the wrong colour is not the brand mark, so each carries its own fill
 * and the button around it stays ours.
 *
 * `aria-hidden` on both: the button already says WHATSAPP GROUP and @HRAJFOTBAL
 * beside them, and a second announcement of the same fact is noise on a screen
 * reader.
 *
 * The paths are the standard published marks. Instagram's is a stroked glyph
 * rather than the multicolour gradient logo — the gradient is a specific asset
 * with its own usage rules, and on black the single-colour mark is what reads.
 */

export function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="#25D366">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.23 8.23 0 0 1 0 16.47z" />
    </svg>
  );
}

export function InstagramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="#E1306C"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      {/* The viewfinder dot. Drawn as a tiny stroked circle rather than a
          filled one so it keeps its weight beside the two shapes above it. */}
      <circle cx="17.6" cy="6.4" r="0.6" />
    </svg>
  );
}
