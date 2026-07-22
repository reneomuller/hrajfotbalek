// =============================================================================
// Generates the PWA / favicon artwork into public/icons/.
//
//   node scripts/generate-icons.mjs
//
// The icons are BUILT, not hand-drawn, for the same reason the OG card is
// (lib/og/shareImage.tsx): the volt and ink values come from tailwind.config.ts,
// so a theme change moves the home-screen icon with it instead of leaving a
// stale PNG nobody remembers to re-export.
//
// Committed output — this script is run by a human when the mark changes, never
// at build time. A home-screen icon that regenerates on every deploy is a cache
// invalidation problem the product has no need for.
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
// `next/og`, spelled with the extension: this runs on bare node, which resolves
// package subpaths literally rather than through Next's bundler aliases.
import { ImageResponse } from 'next/og.js';

// Read straight from the token table rather than retyping the hexes.
const { default: tailwindConfig } = await import('../tailwind.config.ts').catch(() => ({
  default: null,
}));

// tailwind.config.ts is TypeScript; when the loader cannot take it (plain node
// without a TS hook) fall back to the two values this script actually needs,
// which are asserted against the config by the unit test.
const colors = tailwindConfig?.theme?.extend?.colors ?? {};
const VOLT = colors.volt ?? '#C8FF00';
const INK = colors.ink ?? '#080808';

const outDir = path.resolve(process.cwd(), 'public/icons');
mkdirSync(outDir, { recursive: true });

/**
 * The mark: volt HF monogram on ink, inside a volt hairline square.
 *
 * Sized in percentages so one description renders at every icon size. The
 * artwork stays inside the middle 80% — Android maskable icons are cropped to
 * a platform-chosen shape, and anything in the outer ring is not guaranteed to
 * survive that crop.
 */
function mark(size) {
  const inset = Math.round(size * 0.14);
  const border = Math.max(2, Math.round(size * 0.02));
  const radius = Math.round(size * 0.16);

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
    React.createElement(
      'div',
      {
        style: {
          position: 'absolute',
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          border: `${border}px solid ${VOLT}`,
          borderRadius: radius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: Math.round(size * 0.42),
            fontWeight: 800,
            letterSpacing: `-${Math.round(size * 0.02)}px`,
          },
        },
        React.createElement('span', { style: { color: '#FFFFFF' } }, 'H'),
        React.createElement('span', { style: { color: VOLT } }, 'F'),
      ),
    ),
  );
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192 },
  { file: 'public/icons/icon-512.png', size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icons/favicon-32.png', size: 32 },
];

for (const { file, size } of targets) {
  const response = new ImageResponse(mark(size), { width: size, height: size });
  const buffer = Buffer.from(await response.arrayBuffer());
  const target = path.resolve(process.cwd(), file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  console.log(`WROTE  ${file}  (${size}×${size}, ${buffer.length} bytes)`);
}
