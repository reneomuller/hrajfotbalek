import { FlagRU, FlagUA } from "@/components/flags/Flags";
import { getStrings } from "@/lib/i18n/server";

/**
 * "Join our community" — the two places the conversation actually happens.
 *
 * SPLIT OFF FROM THE NUMBERS (v1.2 §6). This panel and `StatsPanel` used to be
 * one: a heading that was itself a statistic ("JOIN A COMMUNITY OF 500+ ACTIVE
 * PLAYERS"), with the two links under it. That heading did two jobs and did
 * neither — as a call to action it buried the verb in the middle of a claim,
 * and as a statistic it could only ever carry one number, so the second one had
 * nowhere to go. Now the invitation is an invitation and the numbers are a
 * panel of numbers.
 *
 * THE OFFICIAL MARKS, from `public/brand/`, at 44px and side by side. A
 * WhatsApp glyph is recognised before the label under it is read, which is the
 * entire reason to put a mark on a button.
 *
 * `components/BrandIcon.tsx` IS GONE. It carried hand-drawn WhatsApp and
 * Instagram SVGs — a stand-in from before there was artwork — and every
 * surface now reads the official marks from `public/brand/` instead. The
 * share button and the organizer card render the same 96px file at 24 and
 * 18px, which is a 4-5x downscale and crisp by construction.
 */
export async function CommunityPanel({
  gamesPerWeek = null,
  activePlayers = null,
}: {
  /** The two claims that used to be a panel of their own (Section 2, item 8). */
  gamesPerWeek?: number | null;
  activePlayers?: number | null;
} = {}) {
  const t = await getStrings();
  const { community } = t.landing;

  const declared: { key: string; value: number | null; label: string }[] = [
    { key: "games", value: gamesPerWeek, label: t.landing.statsGamesLabel },
    { key: "players", value: activePlayers, label: t.landing.statsPlayersLabel },
  ];
  const stats = declared.filter(
    (stat): stat is { key: string; value: number; label: string } => stat.value !== null,
  );

  return (
    <div
      data-testid="community-panel"
      /*
        `lifted rounded-card`, replacing `rounded-[20px] border-hairline-volt
        bg-surface` (redesign v2, round 3).

        THE FRAME'S PANEL EDGE IS NEUTRAL, not volt. Sampled off p01 it is
        rgb(39,40,32) on a rgb(21,22,13) fill against a rgb(11,12,8) ground —
        which is `hairline-strong` on `surface-raised` against `ink`, i.e.
        `.lifted`, the tokenized treatment globals.css already writes once for
        exactly this job. Three panels on this page each spelled it their own
        way with a volt edge, and a volt edge on a panel that is not selected,
        not focused and not a call to action spends the accent on furniture.

        `rounded-[20px]` was also an arbitrary radius two pixels off ruling A's
        `card`.
      */
      /*
        THE GAME PASS BANNER'S TREATMENT (round 25, item 4).

        ~~`.lifted` — `hairline-strong` on `surface-raised`, the neutral panel
        edge sampled off p01, on the reasoning that "a volt edge on a panel
        that is not selected, not focused and not a call to action spends the
        accent on furniture".~~

        THE OWNER OVERRULES THAT FOR THIS PANEL, and the premise it rested on
        is the part that moved: this IS a call to action. Every one of its
        three tiles is a link out to a place the product wants people to go,
        and it is the only invitation on the page now that the hero's own
        button is gone (round 23, item 4). The Game Pass banner is the
        product's existing drawing of exactly that — an outlined panel with a
        semi-transparent volt wash — so this borrows it rather than inventing a
        third treatment.

        `border-hairline-volt bg-volt/[.10]` are the banner's own values, not
        approximations of them: one accent, drawn the same way twice.
      */
      className="flex min-w-[270px] flex-1 flex-col rounded-card border border-hairline-volt bg-volt/[.10] p-[22px]"
    >
      {/* Uppercase, as p01 draws it — §1.4 marks the display steps "Upper". */}
      <h3
        data-testid="community-heading"
        className="m-0 mb-[6px] font-display text-community-title uppercase text-white"
      >
        {community.title}
      </h3>
      <p className="mb-4 max-w-[320px] text-[13px] leading-relaxed text-muted">
        {community.body}
      </p>

      {/*
        THE LOGOS ARE 55px, NOT 44 (round 25, item 4) — a 25% step, and the
        only content change the item allows. The source files are 96px, so the
        larger draw is still downscaling and gains no softness. `h-11 w-11`
        was the 44px tap floor doing double duty as a size; the floor is
        unaffected by growing past it.
      */}

      {/*
        THE NUMBERS MOVED IN HERE (Section 2, item 8), and the standalone stats
        box is gone.

        They were split off in v1.2 §6 because one panel's heading was doing
        two jobs — "JOIN A COMMUNITY OF 500+ ACTIVE PLAYERS" buried the verb in
        a claim and could carry only one number. That reasoning is intact: the
        heading is still an invitation, and the numbers sit UNDER it as their
        own row rather than inside it. What the split cost was a full-width
        panel holding two figures and a lot of air.

        A NUMBER THAT IS NOT SET RENDERS NOTHING — "0+ games every week" on a
        landing page is worse than silence, and the row disappears entirely if
        neither is set.
      */}
      {stats.length > 0 && (
        /*
          TWO EQUAL COLUMNS, NOT A WRAPPING ROW (p01).

          `flex flex-wrap gap-x-8` put the pair side by side at most widths and
          stacked them at 390px — the two figures plus a 32px gap overrun the
          panel's inner width by about eight pixels in English, and by more in
          Czech. So the layout the frame draws was the layout this produced
          everywhere EXCEPT the viewport the frames are drawn at, which is the
          worst way round.

          A two-column grid is unconditional and the columns are equal, which
          is also what makes the two captions start on the same x as each
          other rather than at whatever the figure above them happened to be
          wide. One column when only one number is set, so a lone figure does
          not sit in a half-empty grid.
        */
        <div
          data-testid="community-stats"
          className={`mb-5 grid gap-x-4 gap-y-3 ${stats.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {stats.map((stat) => (
            <div key={stat.key} data-testid={`stat-${stat.key}`}>
              <div
                data-testid={`stat-${stat.key}-value`}
                className="font-display text-[34px] leading-none text-volt"
              >
                {stat.value}
                <span className="text-volt-dim">+</span>
              </div>
              {/* `tracking-[1.5px]` — see ProfileStats. At `eyebrow`'s 3px
                  "GAMES EVERY WEEK" wraps in a half-width column and p01
                  keeps it on one line. */}
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        Stacked and full width rather than side by side. These are the two
        primary outbound actions on the page and at phone width a wrapped pair
        put one of them on its own line anyway — at ragged widths, which read
        as a layout accident rather than a choice.
      */}
      {/*
        `mt-4`, NOT `mt-auto` (verdict, Stage 5).

        `mt-auto` pushed these to the bottom of a box whose height was set by
        the FAQ panel beside it, leaving a visible gap under the body text —
        the links looked detached from the sentence that introduces them. They
        sit directly under it now, and this panel is simply shorter than its
        neighbour, which is fine: `items-stretch` on the row was making a
        height agree that never needed to.
      */}
      {/*
        SIDE BY SIDE, AND THE MARKS CARRY THE ROW.

        They were stacked full-width with a 20px glyph in front of a label,
        which is a menu of two rows. The owner's call is one row of two — so
        each is a `flex-1` tile with a 44px mark above its label, and the pair
        divides the panel's width evenly at every size.

        `basis-0` WITH `flex-1`, not `flex-1` alone: without it the two tiles
        size from their content first, so the longer label makes one tile
        permanently wider than the other. Equal halves is the whole point of
        putting them on one row.

        CENTRED ON BOTH AXES. `items-center` was already doing the horizontal;
        `justify-center` adds the vertical, which matters because the two tiles
        stretch to a shared height — a label that wraps in one language would
        otherwise leave the other tile's contents sitting at the top of a taller
        box, which reads as a misalignment rather than as a longer word.

        THE REAL MARKS, from `public/brand/`, replacing the hand-drawn inline
        SVGs that `components/BrandIcon.tsx` used to hold. That file argued
        for a stroked single-colour Instagram glyph because "the gradient is a
        specific asset with its own usage rules" — a sound argument made when
        there was no asset. There is one now: the owner supplied both official
        marks, which is what the reasoning was standing in for. The file has
        been retired.

        `<img>` rather than `next/image`: a 44px mark from our own `public/`
        needs no optimizer round trip, and 96px of source is 2.2x for a phone.
        `alt=""` throughout — the label sits directly beneath each one, and
        announcing "WhatsApp" twice is noise on a screen reader.
      */}
      {/*
        THREE TILES, AND THE ROW HAD TO GIVE (round 13, item 19).

        At 390 the panel's inner width is about 306px. Two tiles fitted a 15px
        label comfortably; three leave roughly 94px each, and `@HRAJFOTBAL` at
        15px is 120 — it overflowed the panel's right edge, which is how the
        first attempt rendered.

        `gap-2`, `px-2`, `text-[13px]` and `min-w-0` buy the width back, and
        the Instagram label becomes the PLATFORM NAME like the other two. The
        handle is not lost: it is the destination, and it was the only tile
        naming an account where its neighbours named an app.
      */}
      <div className="mt-4 flex gap-2">
        <a
          href={community.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="community-whatsapp"
          className="flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-2 rounded-control border border-hairline-strong px-2 py-4 text-center text-[13px] font-bold tracking-wide text-bone no-underline transition hover:border-whatsapp"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/whatsapp-96.png" alt="" width={55} height={55} className="h-[55px] w-[55px]" />
          {community.whatsapp}
        </a>
        <a
          href={community.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="community-instagram"
          className="flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-2 rounded-control border border-hairline-strong px-2 py-4 text-center text-[13px] font-bold tracking-wide text-bone no-underline transition hover:border-instagram"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/instagram-96.png" alt="" width={55} height={55} className="h-[55px] w-[55px] rounded-[10px]" />
          {community.instagram}
        </a>
        {/*
          TELEGRAM, THIRD (round 13, item 19), and the row still fits at 390:
          three `flex-1 basis-0` tiles are ~110px each, and the longest label
          is "Instagram" at about 70px inside `px-3`.

          `telegram-96.png` is drawn in the same flat treatment as the other
          two — Telegram publishes a gradient roundel, and a gradient at 44px
          is a smudge next to WhatsApp's flat green.
        */}
        <a
          href={community.telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="community-telegram"
          className="flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-2 rounded-control border border-hairline-strong px-2 py-4 text-center text-[13px] font-bold tracking-wide text-bone no-underline transition hover:border-telegram"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/telegram-96.png" alt="" width={55} height={55} className="h-[55px] w-[55px]" />
          {community.telegram}

          {/*
            THE FLAG PAIR (round 18, item 1) — who the group is FOR, said in
            the only way a tile this size can say it.

            SVG, NOT EMOJI, and that is the whole reason `components/flags`
            exists. `🇺🇦` is a pair of regional-indicator codepoints the font is
            expected to ligature into a flag; Windows ships no such glyphs, so
            on a large share of desktop visitors the owner's `🇺🇦 / 🇷🇺` renders
            as the letters "UA / RU" in boxes. Emoji flags are not flags on the
            platform where it matters.

            THE SLASH IS A CHARACTER, not a border, because the owner's format
            is "flag slash flag" and a divider that happens to look like one is
            a divider somebody will restyle.
          */}
          <span
            data-testid="community-telegram-flags"
            className="flex items-center gap-1 text-[11px] leading-none text-muted"
          >
            <FlagUA width={16} />
            <span aria-hidden>/</span>
            <FlagRU width={16} />
          </span>
        </a>
      </div>
    </div>
  );
}
