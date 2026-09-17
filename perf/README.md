# Production performance harness (round 37)

Not one of the four suites. It measures the DEPLOYED product over the real
network, which is the only place several of these numbers exist at all — the
local stack has no transatlantic hop, `next dev` disables `<Link>` prefetch
outright, and the image optimizer is off outside production.

```
npm run perf:prod                      # against the production alias
PERF_BASE=https://…vercel.app npm run perf:prod   # against a specific deploy
```

It writes nothing and asserts nothing. Every number it prints is a median of
repeated runs, and the run count is small on purpose: this is a measuring
instrument, not a monitor, and pointing it at production a hundred times is
load-testing somebody's live site.

## What each number means

**`REGION`** — the edge PoP and the FUNCTION region, read from `x-vercel-id`.
The second is the one that matters: it is where every database round trip
starts. Round 37 found `fra1::iad1` — served from Frankfurt, executed in
Washington DC — against a Supabase project in `eu-west-1`.

**`TTFB`** — time to first byte per journey, median of nine. Subtract the
`STATIC` baseline (a cache-HIT asset on the same host) to get roughly the
server's own time.

**`IMAGES`** — bytes actually transferred for images on the games list, at
Pixel 7's viewport and DPR. Measured in a browser rather than by fetching the
`src` attribute, because with a `srcset` the attribute names the LARGEST
candidate and no phone downloads it.

**`TAP`** — milliseconds from a tap to the destination's FIRST PAINT, skeleton
or real content, whichever arrives. Both legs must be asked the same question:
an early version asked one route for "skeleton or real" and the other for "real
only", and reported a fifteen-fold difference that was an artefact of the
question.
