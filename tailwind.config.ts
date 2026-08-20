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
      /*
       * --- Families: four become two, plus one reserved ---------------
       *
       * `condensed` (Barlow Condensed) is DELETED rather than aliased, and
       * the difference from the colour tokens is deliberate.
       *
       * THE RULE, since this config now does both: delete a token when the
       * ABSENCE of its class produces the intended result, and alias it when
       * absence produces something else. An ungenerated Tailwind class is not
       * a build error — it is simply no CSS — so `font-condensed` on an
       * element now inherits the body font, which IS Manrope, which is
       * exactly where those 117 call sites were going. Whereas an ungenerated
       * `text-section-title` inherits the BODY size rather than the title
       * size, and an ungenerated `rounded-card` is a square corner. Those
       * have to be aliased or the screen silently degrades.
       *
       * `mono` is not deleted and not general-purpose: it is RESERVED for the
       * variabilní symbol and nothing else. That string is copied into a
       * Czech banking app and matched by exact comparison; a proportional
       * font makes 0/O and 1/l confusable, and a mismatched VS is a payment
       * that arrives unreconciled — the one failure here that costs manual
       * work to undo.
       */
      fontFamily: {
        display: ["var(--font-anton)", "sans-serif"],
        sans: ["var(--font-onest)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },

      /*
       * --- Scale: seven steps ----------------------------------------
       *
       * `hero` drops from clamp(58px,12.5vw,124px). Ruling J requires the
       * hero lose at least 25% of its height so the three step cards clear
       * the fold, and the type is the largest part of that height. This one
       * is deliberate and visible — it is the point of the change rather
       * than a hazard, which is why it is not in the silent-delta list.
       *
       * `body-lg` is ONE step with two documented weight variants — 600 by
       * default, 700 for the spots figure — not two steps. Code mirrors the
       * Figma layer rather than inventing a step, because a scale with a
       * step per weight stops being a scale.
       *
       * RULING B, and this is where a reader of the config meets it:
       * `eyebrow` is the ONLY uppercase style in the product. Every button,
       * link, nav label, card title, section heading and day label is
       * sentence case. If a mockup shows tracked capitals anywhere except a
       * small grey eyebrow, the mockup is wrong.
       */
      fontSize: {
        hero: ["clamp(44px,10vw,88px)", { lineHeight: "0.92", letterSpacing: "-1.5px" }],
        /*
         * `page-title` — ADDED in redesign v2 round 3 (R17), CORRECTED in
         * round 12 (R28).
         *
         * ~~The frames set a page's display heading at 32px on a 390
         * viewport: `UPCOMING GAMES` on p02 and `UPCOMING MATCHES` on p01
         * both measure a 23.5px Anton cap height, which is a 32px em. `title`
         * clamps to its 24px floor at that width, so every page heading in
         * the product was rendering a third smaller than the design.~~
         *
         * ~~The clamp keeps `title`'s 6vw slope so the two steps track each
         * other above the fold-width, and the 42px ceiling is 32 scaled by
         * the same 1.24 that separates the floors.~~
         *
         * THE CAP MEASUREMENT WAS RIGHT AND THE CONVERSION WAS WRONG. 23.5px
         * of cap is a 32px em only if Anton's cap-height ratio is 0.73, which
         * is the figure its published metrics give (1462/2048). The ratio it
         * actually RENDERS at is 0.86 — measured off our own screenshot at a
         * known font size, twice, in rounds 10 and 12. So the frames' 23.5px
         * cap is a **27px em**, and this step shipped a fifth too large for
         * nine rounds.
         *
         * `clamp(27px,7vw,36px)` puts 27.3px at 390 — a 23.5px cap, which is
         * the frames' number to a tenth of a pixel. The slope and ceiling keep
         * their relationship to `title`: 7vw against 6vw, and 36 is 27 scaled
         * by the same 1.33 that separates 27 from 24 at the ceiling end.
         *
         * A NEW STEP RATHER THAN A WIDER `title` still holds, and now holds
         * for a better reason: at 390 the two are 27.3 and 24, which is a real
         * step and a small one — exactly what the frames draw.
         *
         * THE GENERAL LESSON, which is worth more than the fix: measure a
         * font's cap ratio on the thing you are measuring with. A published
         * metric describes the outline; the browser rasterises it with
         * hinting, and the two differ by 18% for this face.
         */
        "page-title": ["clamp(27px,7vw,36px)", { lineHeight: "1.05" }],
        title: ["clamp(24px,6vw,34px)", { lineHeight: "1.05" }],
        time: ["28px", { lineHeight: "1" }],
        "body-lg": ["17px", { lineHeight: "1.4" }],
        body: ["15px", { lineHeight: "1.45" }],
        small: ["13px", { lineHeight: "1.4" }],
        eyebrow: ["11px", { letterSpacing: "3px" }],

        /*
         * RETIRING -> the seven above. Removed in Phase 18.
         *
         * These MUST be aliased rather than deleted: an ungenerated
         * `text-section-title` inherits the body size, so deleting would
         * silently shrink 19 headings to 15px and no suite would notice.
         *
         * The mapping is the one in docs/v13/token-map.md §9, which is marked
         * INFERRED — the design system gives the seven surviving steps but no
         * "Replaces" column for type, and none of these seven names appears
         * in it. `card-title` is the least certain: it sits between `body-lg`
         * and `title`, and is mapped to `body-lg` on the reading that a card
         * title is emphasis rather than hierarchy. One call site.
         */
        "hero-sub": ["clamp(24px,6vw,34px)", { lineHeight: "1.05" }],
        "section-title": ["clamp(24px,6vw,34px)", { lineHeight: "1.05" }],
        "match-title": ["clamp(24px,6vw,34px)", { lineHeight: "1.05" }],
        "community-title": ["clamp(24px,6vw,34px)", { lineHeight: "1.05" }],
        "card-title": ["17px", { lineHeight: "1.4" }],
        lede: ["15px", { lineHeight: "1.45" }],
        cta: ["17px", { lineHeight: "1.4" }],
      },

      /*
       * --- One breakpoint --------------------------------------------
       *
       * `md = 768px`, and no other. Replacing Tailwind's default set is safe
       * here and was checked rather than assumed: `sm:`, `lg:`, `xl:` and
       * `2xl:` have zero usages across app/ and components/, while `md:` has
       * four.
       *
       * One is enough because only one thing genuinely changes shape — the
       * nav pill gives way to the header's link row — and naming it once
       * stops each of the eight build stages choosing its own.
       */
      screens: {
        md: "768px",
      },
      letterSpacing: {
        eyebrow: "3px",
        wide: "0.5px",
      },
      maxWidth: {
        /*
         * `shell` is CHROME width — the header's inner row, which spans wider
         * than the reading column so the wordmark and the auth control sit at
         * the edges of the screen rather than floating in the middle of it.
         *
         * `content` is READING width. Capped at 720px and centred at and above
         * `md`, because a games list stretched across 1280px is a list whose
         * left edge and right edge are read by different eye movements. Below
         * `md` it does nothing: the viewport is already narrower than the cap,
         * and the 22px gutter is what holds content off the edge.
         *
         * Two tokens rather than one because the two jobs genuinely differ,
         * and collapsing them would either cramp the header or stretch the
         * text.
         */
        shell: "980px",
        content: "720px",
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
      /*
       * --- Spacing: a 4-point scale ----------------------------------
       *
       * 4 / 8 / 12 / 16 / 22 / 32 / 48. `22` is the page gutter and stays the
       * outer margin on every screen; card padding is `16`; the gap between
       * cards in a list is `12`; between sections, `32`.
       *
       * 22 is the one value off the 4-point grid, and it is kept rather than
       * rounded to 24 because it is the existing gutter on every screen in
       * the product — moving it would shift every layout horizontally to
       * satisfy a rule about arithmetic.
       */
      /*
       * --- Spacing: a 4-point scale ----------------------------------
       *
       * 4 / 8 / 12 / 16 / 22 / 32 / 48. `22` is the page gutter and stays the
       * outer margin on every screen; card padding is `16`; the gap between
       * cards in a list is `12`; between sections, `32`.
       *
       * SIX OF THE SEVEN ARE ALREADY TAILWIND'S DEFAULTS — `1` `2` `3` `4`
       * `8` `12` resolve to exactly 4/8/12/16/32/48px — so they are NOT
       * restated here. Redefining a token to the value it already has reads
       * like a change, invites the next reader to wonder what moved, and
       * implies the keys NOT listed were removed, which `extend` does not do.
       * The scale is a rule about which of the existing steps to use, and it
       * belongs in docs/v13/type-scale.md where it can be read as one.
       *
       * `22` is the only value off the 4-point grid and the only one that
       * needs declaring. It is kept rather than rounded to 24 because it is
       * the existing gutter on every screen in the product; moving it would
       * shift every layout sideways to satisfy a rule about arithmetic.
       */
      spacing: {
        gutter: "22px",
        nav: "64px",
        /*
         * The bottom tab bar's content height, WITHOUT the safe-area inset —
         * the inset is added at the render site via the `--tabbar-h` custom
         * property in globals.css, because Tailwind cannot express `env()`
         * arithmetic in a token and a hard-coded 64px would put the tab labels
         * under an iPhone's home indicator.
         *
         * 52 -> 72 (redesign v2, round 1), and MEASURED rather than reasoned.
         *
         * The frames give each tab its own filled cell with real gaps. The
         * bar's own padding went 4px to 8px, and the cell gained `py-2` — which
         * pushes it past the 44px target floor to 56px (20px icon + 2px gap +
         * the label + 16px padding). 8 + 56 + 8 = 72.
         *
         * The first attempt at this number was 60, arrived at by assuming the
         * cell stayed at its `min-h-11` floor. It did not. THREE things read
         * this value — the page wrapper's bottom padding, the game page's
         * fixed claim bar, and the bar itself — so the spec asserting that the
         * claim bar's bottom edge MEETS the bar's top edge caught the 12px
         * gap, twice. Measure this in the browser when the bar changes; do not
         * add up the classes.
         */
        tabbar: "72px",
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
      /*
       * --- Elevation: one shadow ------------------------------------
       *
       * The claim bar and the nav pill cast UPWARD, so content scrolling
       * under them reads as under rather than as cut off. That is the only
       * shadow in the product.
       *
       * `volt-glow` and `volt-glow-lg` are DELETED, not aliased, under the
       * same rule as `font-condensed`: absence produces the intended result.
       * A glow on everything is the same problem as a border on everything,
       * and its four call sites simply stop glowing — which is the
       * retirement. The dead class strings are swept in Phase 17.
       */
      boxShadow: {
        lift: "0 -8px 24px rgba(0,0,0,.6)",
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
