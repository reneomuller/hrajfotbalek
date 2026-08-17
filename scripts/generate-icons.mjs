// =============================================================================
// Generates every fixed-size rendering of the brand mark.
//
//   node scripts/generate-icons.mjs
//
// ONE SOURCE, SEVEN OUTPUTS. `public/brand/hf-logo.png` is the mark — the
// owner's artwork, downscaled once to a 512px master — and everything below is
// derived from it. The alternative is seven PNGs exported by hand, which is how
// a product ends up with a home-screen icon one revision behind its header.
//
// WHAT THIS REPLACES, and it is a real trade rather than a cleanup. The mark
// used to be DRAWN here from `tailwind.config.ts`: a volt HF monogram inside a
// volt hairline square, built from the token table so "a theme change moves the
// home-screen icon with it instead of leaving a stale PNG nobody remembers to
// re-export". That property is gone. The mark is now a photograph of a football
// inside a volt ring, and no token table can produce it — a real logo is an
// asset, not a recipe. What the tokens still own is the FIELD the mark sits on
// (`ink`), which is why that one value is still read from the config below.
//
// The consequence, stated so nobody has to rediscover it: changing `volt` no
// longer changes these icons. Changing the mark means replacing
// `public/brand/hf-logo.png` and re-running this script.
//
// Committed output — run by a human when the mark changes, never at build time.
// A home-screen icon that regenerates on every deploy is a cache invalidation
// problem the product has no need for.
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
// `next/og`, spelled with the extension: this runs on bare node, which resolves
// package subpaths literally rather than through Next's bundler aliases.
import { ImageResponse } from 'next/og.js';

// Read straight from the token table rather than retyping the hex.
const { default: tailwindConfig } = await import('../tailwind.config.ts').catch(() => ({
  default: null,
}));

// tailwind.config.ts is TypeScript; when the loader cannot take it (plain node
// without a TS hook) fall back to the one value this script still needs.
//
// NOTHING ASSERTS THAT FALLBACK against the config. The comment this replaces
// claimed a unit test did — it does not, and never did; the claim was inherited
// from a sibling script and repeated until it read as fact. The fallback is a
// literal that can drift from `colors.ink` in silence. It survives because the
// window is narrow: this script is run by hand, prints every file it writes,
// and its output is committed and reviewable as an image.
const colors = tailwindConfig?.theme?.extend?.colors ?? {};
const INK = colors.ink ?? '#080808';

const SOURCE = path.resolve(process.cwd(), 'public/brand/hf-logo.png');

/**
 * The master, inlined.
 *
 * Satori resolves `<img src>` itself and will happily fetch a URL, which would
 * make this script depend on a running server. A data URI is the file, read
 * once, with nothing between it and the renderer.
 */
const dataUri = `data:image/png;base64,${readFileSync(SOURCE).toString('base64')}`;

/**
 * The mark at one size.
 *
 * `safe` is the fraction of the frame the artwork may occupy, and it exists for
 * exactly one platform: Android crops a MASKABLE icon to a shape it chooses —
 * circle, squircle, teardrop — and anything outside the middle 80% is not
 * guaranteed to survive. The mark is a roundel, so an inset costs nothing but
 * air; going full-bleed would let a squircle crop bite the volt ring.
 *
 * A browser favicon and the header mark are never cropped, so those go to the
 * edge and win the pixels back — at 32px the difference between 80% and 100% is
 * the difference between a legible monogram and a smudge.
 */
function mark(size, safe) {
  const art = Math.round(size * safe);

  return React.createElement(
    'div',
    {
      style: {
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: INK,
      },
    },
    React.createElement('img', { src: dataUri, width: art, height: art }),
  );
}

/**
 * `safe: 0.8` wherever a platform crops, `1` wherever one does not.
 *
 * `app/icon.png` and `app/apple-icon.png` are Next's file conventions and take
 * precedence over anything in `public/` — they are listed here so the whole set
 * moves together. A hand-made pair sitting beside a generated one is how the
 * tab icon and the home-screen icon come to disagree.
 */
const targets = [
  { file: 'public/icons/icon-192.png', size: 192, safe: 0.8 },
  { file: 'public/icons/icon-512.png', size: 512, safe: 0.8 },
  { file: 'public/apple-touch-icon.png', size: 180, safe: 0.8 },
  { file: 'app/apple-icon.png', size: 180, safe: 0.8 },
  { file: 'public/icons/favicon-32.png', size: 32, safe: 1 },
  { file: 'app/icon.png', size: 192, safe: 1 },
  // The header mark, at 2.5x its 38px render box so it stays crisp on a phone.
  { file: 'public/brand/hf-logo-96.png', size: 96, safe: 1 },
];

for (const { file, size, safe } of targets) {
  const response = new ImageResponse(mark(size, safe), { width: size, height: size });
  const buffer = Buffer.from(await response.arrayBuffer());
  const target = path.resolve(process.cwd(), file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  console.log(`WROTE  ${file}  (${size}×${size}, ${buffer.length} bytes)`);
}

// -----------------------------------------------------------------------------
// The share card's copy of the mark, as a module rather than a file.
//
// The OG card is rendered by Satori inside a server route, and Satori needs the
// BYTES of an image — it cannot take a `/brand/...` path, because there is no
// document and no origin to resolve it against. The three ways to hand it bytes
// are a `readFileSync` from `public/` at request time, a `fetch` of the site's
// own URL, or this.
//
// The first two both fail in the same place. `public/` is served by the CDN and
// is not guaranteed to be inside the serverless bundle that renders the card,
// and a fetch makes an image the page cannot draw without a second network hop
// to itself — one that needs `NEXT_PUBLIC_SITE_URL` to be exactly right, which
// is already this codebase's most reliable way to break something silently.
//
// So the bytes are committed as a string. 112px because the card draws the mark
// at 56, and small enough that the base64 costs the bundle a few kilobytes.
// -----------------------------------------------------------------------------
const OG_MARK_PX = 112;
const ogResponse = new ImageResponse(mark(OG_MARK_PX, 1), {
  width: OG_MARK_PX,
  height: OG_MARK_PX,
});
const ogBase64 = Buffer.from(await ogResponse.arrayBuffer()).toString('base64');
const ogModule = path.resolve(process.cwd(), 'lib/og/mark.ts');

writeFileSync(
  ogModule,
  `/**\n` +
    ` * The brand mark, inlined for Satori. GENERATED — do not edit.\n` +
    ` *\n` +
    ` * Written by \`scripts/generate-icons.mjs\` from \`public/brand/hf-logo.png\`\n` +
    ` * at ${OG_MARK_PX}px, alongside the favicon and the PWA icons. Re-run that\n` +
    ` * script when the mark changes; editing this file by hand will be undone\n` +
    ` * the next time anyone does.\n` +
    ` *\n` +
    ` * Why a module and not a file read: see the note at the foot of the script.\n` +
    ` */\n` +
    `export const OG_MARK_DATA_URI =\n  "data:image/png;base64,${ogBase64}";\n`,
);
console.log(`WROTE  lib/og/mark.ts  (${OG_MARK_PX}×${OG_MARK_PX}, ${ogBase64.length} base64 chars)`);
