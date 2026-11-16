/**
 * THE GAME CARD'S DARKENING over its photograph — the ramp that makes the type
 * readable and the short shade behind the venue title.
 *
 * ITS OWN COMPONENT SINCE 2026-11-16, because three places draw it: the card,
 * the venue photo's crop window and the admin's preview of the saved photo.
 * The owner: "i would like for me to select the photo, crop it to fit the
 * outline, and for it to show up the same exact way on the game card". The
 * window used to show the photo at full brightness while the card took its
 * bottom third to black, so a goal framed low vanished under the faces. Now
 * the window darkens exactly as the card does, from the same two layers.
 *
 * Fills its nearest positioned ancestor, which must be the frame's own box
 * (`1600x740`): every stop below is a share of the frame, so it lands on the
 * same part of the picture at every width.
 *
 * THE RAMP'S `to-70%` IS LOAD-BEARING OUTSIDE THIS FILE: `GameCard` holds the
 * card at least as tall as the frame's lit 70% (`aspect-[1600/518]`) and lets
 * the solid ink beyond fall off the card's foot. Move the stop, move that box.
 */
export function CardPhotoScrim() {
  return (
    <>
      {/*
        THE GRADIENT IS A RAMP, NOT A DIMMER — rebalanced from p02.

        The first version was a uniform-ish wash (.68 -> .82 -> .92) and it
        crushed the photograph to near-invisible: the card read as a dark
        slab that happened to have texture. p02 draws the opposite — the
        pitch is CLEARLY there behind the venue title, and the image darkens
        as it falls toward the avatars and the join cue, which is where the
        small text lives.

        So the stops now start almost clear and end heavy. The dark end is
        what the bar, the faces and the cue sit on; the clear end is the
        picture doing the job it was added for.
      */}
      {/*
        THE FADE HAS A BOUNDARY, AND THE BOUNDARY IS THE CAPACITY BAR
        (round 8, item 5).

        It was `.12 -> .52 -> .90`: a wash across the whole card that never
        finished. The photograph was faintly present everywhere and fully
        gone nowhere, so the bar, the faces and the cue all sat on texture
        instead of on a surface — and the top, where the photograph is
        supposed to read, was being dimmed to make that texture survivable.

        Measured off the rendered card at 390px: the venue title ends at 23%,
        the time pill at 56%, and the capacity bar begins at about 58%. So
        the ramp holds light through the title and the time row, climbs
        across the pill's lower edge, and reaches FULL `ink` at 72% — before
        the bar, and well before the faces and the cue. Everything from
        there down is flat page surface, which is what `p02` draws.

        `to-ink`, NOT `to-ink/[.90]`. The old end left a tenth of the
        photograph under the busiest, smallest elements on the card; a
        gradient that stops short of its own colour is a gradient with a
        seam nobody put there on purpose.
      */}
      <span
        data-testid="card-scrim"
        className="absolute inset-0 bg-gradient-to-b from-ink/[.15] via-ink/[.45] via-50% to-ink to-70%"
      />
      {/*
        TEXT PROTECTION, LOCAL TO THE TITLE LINE.

        The venue title sits at the top, and rather than dimming the WHOLE
        card to rescue one line, this is a short gradient behind the title
        band only.

        `.72` -> `.55`, AND THE CROP IS WHY IT CAN COME DOWN (round 7, item
        3). `.72` was set against a PALE SKY sitting behind the title — the
        measurement that mattered was white-on-cloud. `object-bottom` above
        puts green field there instead, which is both darker and textured,
        so the same legibility needs less scrim.

        64px -> 48px (round 8, item 5). The title ends at 23% of a 146px
        card, so 48px covers it exactly; at 64 this reached down into the
        time row and dimmed the part of the photograph the new boundary is
        there to keep visible. Measured against `p02`: the
        frame's card reads about 76 mean luminance across its title band and
        this was rendering about 60, which is the "washed out, does not match
        the frame" complaint stated as a number.

        48px -> 30% (2026-11-16): the same 48px at 390, now a share of the
        frame, because the frame grows with the card's width.

        The two changes are one change. Dropping the scrim alone would put
        white text on a pale sky; re-cropping alone would leave the photo
        needlessly dim. Neither is correct on its own.

        A separate element rather than another stop on the ramp above,
        because the two do different jobs and one of them is allowed to
        change when the type does.
      */}
      <span
        data-testid="card-title-scrim"
        className="absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-ink/[.55] to-transparent"
      />
    </>
  );
}
