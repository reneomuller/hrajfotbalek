"use client";

import { usePathname } from "next/navigation";
import { PitchBackground, type BackgroundIntensity } from "@/components/PitchBackground";

/**
 * The background treatment, for every page rather than just the landing one.
 *
 * Three fixed layers, in the reference's own order: the pitch-and-particles
 * canvas at z-0, grain over it, then the page vignette at z-1. Everything the
 * app renders sits at z-10 and above, which is why every page shell in this
 * codebase already carries `relative z-10`.
 *
 * WHY IT PICKS ITS OWN INTENSITY FROM THE PATHNAME rather than taking a prop:
 * it is mounted once, from the root layout, so there is no per-page render
 * where a prop could be passed. Mounting it once is the point — a background
 * that remounted per navigation would restart the particle field and reset the
 * pitch on every link click, which is exactly the flicker this layer exists to
 * avoid.
 *
 * The landing page is mostly background with content on it, so it gets the
 * reference verbatim. Everything else is mostly content — a games list, a
 * booking flow, an admin table — and gets the same composition at low weight.
 * Making the split by route rather than by a flag on each page keeps the
 * decision in one readable place.
 *
 * REDUCED MOTION is handled inside `PitchBackground` (the pitch draws, the
 * loop never starts) and by the grain layer's `motion-reduce:animate-none`.
 * Both layers keep their structure and lose only their movement.
 */

/** Routes that get the reference's full-strength treatment. */
const FULL_ROUTES = ["/"];

export function SiteBackground() {
  const pathname = usePathname() ?? "/";
  const intensity: BackgroundIntensity = FULL_ROUTES.includes(pathname)
    ? "full"
    : "subtle";

  return (
    <>
      <PitchBackground intensity={intensity} />

      {/* Grain — the reference's unused `drift` keyframe, given its tile. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 animate-drift bg-grain bg-grain-tile motion-reduce:animate-none"
      />

      {/* Vignette over the whole page — the reference's fixed overlay. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] bg-page-vignette"
      />
    </>
  );
}
