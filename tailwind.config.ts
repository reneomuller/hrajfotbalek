import type { Config } from "tailwindcss";

/**
 * Theme tokens extracted verbatim from the volt-on-black design reference
 * (`index.html`). This file is the single source of truth for colour, type and
 * spacing values — no inline hex may appear in `app/` or `components/`.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /*
         * ============================================================
         * v1.3, ruling A — the token table collapses, as ONE change
         * ahead of any screen.
         *
         * Nine text greys become three, nine hairlines become three,
         * six radii become three, four families become two. The
         * complaint this answers is not a list of screens: it is
         * "messy and hard to navigate", and the mechanism named in the
         * analysis is a table that was a sampling of a reference
         * rather than a system.
         *
         * HOW THE RETIRING NAMES ARE HANDLED, and why they are still
         * below. A token deleted here is a class that stops resolving
         * in 83 files, and the call-site sweep is Phase 17 — so
         * deleting now would leave two commits in which the product
         * does not build. Instead every retiring name is kept as an
         * ALIAS POINTING AT ITS SURVIVING VALUE. That has a property
         * worth more than the tidiness it costs:
         *
         *   the appearance changes NOW, and the sweep changes nothing.
         *
         * Stage 0's whole job is that every screen changes appearance
         * without any screen being redesigned, and this is what
         * delivers it. Phase 17 then renames call sites with no visual
         * effect at all, which makes its enormous diff reviewable —
         * a strip taken before and after Phase 17 should be identical,
         * and any difference is a mistake.
         *
         * The aliases are deleted in Phase 17/18, once nothing names
         * them. Each is marked RETIRING.
         * ============================================================
         */

        // --- Accent, unchanged -------------------------------------
        volt: "#C8FF00",
        "volt-dim": "#8FB800",

        /*
         * --- Surfaces: opaque now (F6) ----------------------------
         *
         * `surface` #0A0A0A -> #0F0F0F and `surface-raised`
         * #0D0D0D -> #161616, and the translucent family collapses
         * into them. v1.1.2 §8 already made panels MORE opaque
         * because the pitch background was winning against the text
         * on it; taking them solid finishes that argument rather than
         * re-tuning it a third time.
         *
         * These two are the F6 delta and they are silent: the token
         * names do not change, so no call site looks wrong. A port
         * that kept the old values would compile, read correctly in
         * review, and simply be the old design.
         */
        ink: "#080808",
        surface: "#0F0F0F",
        "surface-raised": "#161616",
        // Roster avatar fill and the unfilled half of the capacity bar.
        "surface-avatar": "#222222",
        "surface-seg": "#242424",

        /*
         * THE ONE SURVIVING TRANSLUCENCY. Translucency retires from
         * cards, and survives in exactly one place: the scrim over a
         * venue photo, where there is something behind it worth
         * seeing. A sweep that maps every `surface-*` to opaque
         * `surface` puts a solid block on the photograph.
         */
        "surface-overlay": "rgba(10,10,10,.94)",

        // RETIRING -> surface. Removed in Phase 17.
        "surface-card": "#0F0F0F",
        "surface-card-strong": "#0F0F0F",
        "surface-panel": "#0F0F0F",

        /*
         * --- Text: nine tones become three ------------------------
         *
         * `faint` moves #6F6F6F -> #7E7E7E, and it is a CONTRAST
         * REPAIR rather than a taste change. #6F6F6F computes to
         * roughly 3.8:1 on `surface` — under the 4.5:1 AA floor for
         * normal text — and it is assigned to 11px and 13px styles
         * carrying real content: the day-strip game count, the pass
         * card's expiry line, and the claim bar's "Kicked off 19:00",
         * which is the entire message of the bar in that state.
         *
         * WHY #7E7E7E AND NOT #8A8A8A. #8A8A8A clears AA comfortably
         * at 5.6:1 and is the wrong answer: the analysis names
         * #9A9A9A/#8A8A8A as THE example of two greys that are the
         * same colour at 390px, and `muted` is #9A9A9A. Fixing the
         * contrast by recreating the exact pair this round exists to
         * delete would be a fix that undoes the ruling it is made
         * under. #7E7E7E is as low as the floor allows (#7B7B7B is
         * 4.5:1 exactly), which buys the widest separation from
         * `muted` that still clears it — 28 levels rather than 16.
         *
         * The band is narrow, and that is the real finding: with
         * `muted` at ~6.8:1 and the floor at 4.5:1 a third tone has
         * about 30 levels of room. The rule that keeps it a distinct
         * step: `faint` is for genuinely tertiary text, never for the
         * only statement of a fact. Where a faint line is the only
         * place something is said, it renders at `small`, not
         * `eyebrow`. If a fourth tone is ever proposed, this band is
         * the argument against it.
         */
        bone: "#E9E7E0",
        muted: "#9A9A9A",
        faint: "#7E7E7E",

        // RETIRING -> bone / muted / faint. Removed in Phase 17.
        chalk: "#E9E7E0",
        "muted-dim": "#9A9A9A",
        subtle: "#9A9A9A",
        "footer-dim": "#9A9A9A",
        dim: "#7E7E7E",

        /*
         * --- Hairlines: nine become three -------------------------
         *
         * Two silent deltas live here, and only one of them is in the
         * analysis.
         *
         * `hairline-volt` .18 -> .30 is F5, called out precisely so it
         * would not be discovered at implementation time: a port that
         * preserves .18 compiles, keeps the token, and leaves every
         * selected state in the product too faint to read as selected.
         * .30 is today's `hairline-volt-strong`.
         *
         * `hairline-strong` .12 -> .14 is NOT in the analysis and was
         * found while measuring the change surface. It absorbs today's
         * `hairline-link` value, which makes the lazy migration
         * (link -> strong) accidentally correct while `hairline-strong`'s
         * own 39 existing call sites quietly darken. Small, and it is
         * the secondary-button outline on every screen.
         */
        hairline: "rgba(255,255,255,.08)",
        "hairline-strong": "rgba(255,255,255,.14)",
        "hairline-volt": "rgba(200,255,0,.30)",

        // RETIRING -> the three above. Removed in Phase 17.
        "hairline-soft": "rgba(255,255,255,.08)",
        "hairline-chrome": "rgba(255,255,255,.08)",
        "hairline-link": "rgba(255,255,255,.14)",
        "hairline-volt-soft": "rgba(200,255,0,.30)",
        "hairline-volt-strong": "rgba(200,255,0,.30)",

        /*
         * --- Focus: a new token, and it is not a hairline ----------
         *
         * `hairline-volt` at .30 over `surface-raised` computes to
         * roughly 2.4:1 — below the 3:1 WCAG 1.4.11 requires of a
         * non-text indicator — and it was the only focus affordance
         * the spec named. A focus ring is a different job from a
         * selected outline: selection is a property of the thing,
         * focus is a property of where the keyboard is. Full-opacity
         * volt, 2px, with a 2px offset so it stays legible on a
         * volt-filled control where a ring on its own edge would
         * vanish.
         */
        "focus-ring": "#C8FF00",
        /*
         * THE SPOTS-LEFT LADDER (v1.2 §5.5). Volt at rest, amber when a game is
         * filling, red when it is nearly gone — the number and the bar take the
         * same colour, because two things saying the same thing in two colours
         * is two things to reconcile.
         *
         * Volt stays the "plenty" rung rather than a true green: the reference
         * uses green because green is its brand, and ours is volt. Substituting
         * a second green here would put two accents on one row.
         *
         * Both are chosen for legibility against #0A0A0A rather than for being
         * canonical orange and red — this is the one place the palette carries
         * meaning rather than character, so contrast wins.
         */
        warn: "#FFA31A",
        danger: "#FF5A4E",
        // External brand
        whatsapp: "#25D366",
        instagram: "#E1306C",
      },
      fontFamily: {
        display: ["var(--font-anton)", "sans-serif"],
        condensed: ["var(--font-barlow-condensed)", "sans-serif"],
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      fontSize: {
        // clamp() pairs from the reference, mobile-first
        hero: ["clamp(58px,12.5vw,124px)", { lineHeight: "0.9", letterSpacing: "-1.5px" }],
        "hero-sub": ["clamp(20px,5vw,30px)", { lineHeight: "1.1" }],
        "section-title": ["clamp(26px,7vw,40px)", { lineHeight: "1.05" }],
        lede: ["clamp(14px,3.6vw,17px)", { lineHeight: "1.55" }],
        "match-title": ["clamp(26px,5.8vw,36px)", { lineHeight: "1.02", letterSpacing: "0.2px" }],
        "card-title": ["clamp(20px,4.5vw,26px)", { letterSpacing: "0.3px" }],
        "community-title": "clamp(20px,4.6vw,28px)",
        cta: ["clamp(16px,4vw,19px)", { lineHeight: "1" }],
        eyebrow: ["clamp(9px,2.4vw,11px)", { letterSpacing: "3px" }],
      },
      letterSpacing: {
        eyebrow: "3px",
        wide: "0.5px",
      },
      maxWidth: {
        shell: "980px",
      },
      backgroundSize: {
        /*
         * One `drift` cycle — see the `grain` gradient below. Named
         * `grain-tile` rather than `grain` on purpose: Tailwind generates both
         * backgroundImage and backgroundSize utilities under the `bg-` prefix,
         * so two entries called `grain` would produce one class that silently
         * wins over the other.
         */
        "grain-tile": "60px 60px",
      },
      spacing: {
        gutter: "22px",
        nav: "64px",
        /*
         * The bottom tab bar's content height, WITHOUT the safe-area inset —
         * the inset is added at the render site via the `--tabbar-h` custom
         * property in globals.css, because Tailwind cannot express `env()`
         * arithmetic in a token and a hard-coded 64px would put the tab labels
         * under an iPhone's home indicator.
         */
        tabbar: "64px",
      },
      /*
       * --- Radius: six become three -----------------------------------
       *
       * Two of the three survive BY NAME and change value, which makes
       * them silent deltas exactly like `hairline-strong`, and neither is
       * in the analysis:
       *
       *   control  8px -> 14px   every button, input and day box
       *   card    16px -> 18px   cards, panels, sheets, the claim bar
       *
       * `control` nearly doubles and is the most visible single change in
       * the whole token layer. At the Stage 0 strip review it will read as
       * "the redesign looks different" rather than as "a token moved",
       * which is the correct impression and the wrong explanation.
       *
       * `pill` is new and takes chips, the spots pill, the nav capsule and
       * the level badge. A 5px chip corner becoming fully round is the
       * largest single jump in the migration map.
       */
      borderRadius: {
        pill: "999px",
        control: "14px",
        card: "18px",

        // RETIRING -> pill / control. Removed in Phase 17.
        chip: "999px",
        badge: "999px",
        cta: "14px",
      },
      boxShadow: {
        "volt-glow": "0 0 10px #C8FF00",
        "volt-glow-lg": "0 0 16px rgba(200,255,0,.6)",
      },
      backgroundImage: {
        "page-vignette":
          "radial-gradient(120% 90% at 50% 0%,transparent 55%,rgba(0,0,0,.5) 100%)",
        "map-vignette":
          "radial-gradient(130% 110% at 50% 45%,transparent 50%,rgba(6,6,6,.6) 100%)",
        /*
         * Grain. THE ONE BACKGROUND ELEMENT THAT IS AN EXTENSION rather than a
         * port: the reference ships a `drift` keyframe (background-position
         * 0 0 → 60px 60px) with nothing wired to it, which is the tile this
         * animates. A 60px dot lattice at 2% white, drifting one full tile —
         * it reads as film grain over the flat black and gives the fixed
         * layers something to sit on. Sized to match the keyframe's travel, so
         * the loop is seamless.
         */
        grain:
          "radial-gradient(rgba(255,255,255,.02) 1px,transparent 1px)",
        instagram: "linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7)",
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(.6)", opacity: ".7" },
          "100%": { transform: "scale(2.3)", opacity: "0" },
        },
        blink: {
          "0%,90%,100%": { opacity: "1" },
          "94%": { opacity: ".25" },
        },
        drift: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "60px 60px" },
        },
        floatY: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(7px)" },
        },
      },
      animation: {
        blink: "blink 3s infinite",
        drift: "drift 6s linear infinite",
        floatY: "floatY 2.4s ease-in-out infinite",
        pulseRing: "pulseRing 2.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
