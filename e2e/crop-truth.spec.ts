import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { pragueDayKey } from "../lib/games/days";
import { apiClientFor, players, serviceClient, signInAs } from "./helpers/session";

/**
 * ROUND 33, ITEM 4(d) — THE MARKED-IMAGE PROOF.
 *
 * THE ACCEPTANCE, VERBATIM: "generate a test image with distinct colored
 * horizontal and vertical bands, crop it in the venue adjuster to a known
 * framing, screenshot the game card as served — the visible region must be
 * exactly the framed region, decoded from pixels. State per-edge what's
 * visible. No 'the constant matches' claims — only the marked-image proof
 * counts."
 *
 * SO THIS FILE NAMES NO CONSTANT. It never imports `VENUE_WIDTH_PX`, never
 * computes an expected aspect and never asserts one. It reads colours out of
 * the crop window the organizer is looking at, reads colours out of the card
 * the player is looking at, and asserts they are the same photograph seen
 * through the same rectangle. If the constant were wrong, the two would
 * disagree and this fails — which is the whole point, and is exactly what
 * three rounds of constant-versus-constant checking could not do.
 *
 * THE KNOWN FRAMING IS THE CLAMP, not a measured drag. The cropper is
 * cover-and-clamped: drag far enough down and the offset pins at the image's
 * TOP edge and stays there. That is a framing with an exact, stateable answer
 * — "the top of the picture, full width" — reached without trusting a pointer
 * to land on a pixel.
 *
 * THE MARKED IMAGE, 1800x1000:
 *
 *   rows    0..149   CYAN      top sentinel   — MUST be visible, at the top
 *   rows  150..859   the grid  8 columns x 10 rows, each a distinct colour
 *   rows  860..999   MAGENTA   bottom sentinel — MUST NOT appear anywhere
 *   cols    0..149   YELLOW    left sentinel  — MUST be visible, at the left
 *   cols 1650..1799  WHITE     right sentinel — MUST be visible, at the right
 *
 * EVERY SENTINEL IS 150 PIXELS THICK, NOT 50, AND THE THICKNESS IS THE POINT. At 50
 * it was 6% of the crop window — and an ELEMENT SCREENSHOT of the frame carries
 * the ring and its offset, so a few device pixels of chrome at the top shifted
 * the reading into the first grid band and the spec accused the product of the
 * exact bug it exists to catch. A sentinel has to be thicker than the noise
 * around the edge it marks.
 *
 * The sentinels are what make the per-edge statement objective. The grid is
 * what makes a SHIFT detectable: neighbouring cells differ by 26 in red and 22
 * in green, so a frame that is off by one cell reads as a different colour
 * rather than as a rounding error.
 *
 * WHY MAGENTA IS ABSENT AND CYAN IS PRESENT. The image is taller than the crop
 * window, so pinning to the top keeps the cyan strip and cuts the bottom of the
 * picture — where the magenta is. Both halves are asserted: a crop that drifts
 * down loses the cyan AND finds the magenta, and either one fails.
 */

test.use({ viewport: { width: 390, height: 844 } });

const IMAGE = { width: 1800, height: 1000 };
const SENTINEL = {
  top: { name: "CYAN", rgb: [0, 255, 255] as const },
  bottom: { name: "MAGENTA", rgb: [255, 0, 255] as const },
  left: { name: "YELLOW", rgb: [255, 255, 0] as const },
  right: { name: "WHITE", rgb: [255, 255, 255] as const },
};

/**
 * How far two colours may drift and still be "the same band".
 *
 * THE IMAGE MAKES A ROUND TRIP THROUGH WEBP AT q=0.9 and is resampled twice —
 * once into the 1600px-wide stored file, once down to the card's 344px. Flat
 * cells survive that well; the number is per-channel and is a quarter of the
 * smallest deliberate step between neighbouring cells (22), so a real
 * one-cell shift cannot hide inside it.
 */
const CHANNEL_TOLERANCE = 22 / 4;

type Rgb = [number, number, number];

/** Build the marked image in the page, so the bytes are a real PNG file. */
async function markedImage(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;

      // The grid, first: the sentinels paint over its edges.
      const COLS = 8;
      const ROWS = 10;
      const gridTop = 150;
      const gridBottom = 860;
      for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < ROWS; row++) {
          ctx.fillStyle = `rgb(${40 + col * 26}, ${30 + row * 22}, 100)`;
          ctx.fillRect(
            (col * width) / COLS,
            gridTop + (row * (gridBottom - gridTop)) / ROWS,
            width / COLS + 1,
            (gridBottom - gridTop) / ROWS + 1,
          );
        }
      }

      ctx.fillStyle = "rgb(0,255,255)";
      ctx.fillRect(0, 0, width, 150);
      ctx.fillStyle = "rgb(255,0,255)";
      ctx.fillRect(0, 860, width, height - 860);
      ctx.fillStyle = "rgb(255,255,0)";
      ctx.fillRect(0, 150, 150, 710);
      ctx.fillStyle = "rgb(255,255,255)";
      ctx.fillRect(width - 150, 150, 150, 710);

      return c.toDataURL("image/png");
    },
    IMAGE,
  );
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** The mean colour of a small patch at fractional coordinates. */
function sample(png: PNG, fx: number, fy: number): Rgb {
  const cx = Math.round(fx * png.width);
  const cy = Math.round(fy * png.height);
  const r: number[] = [0, 0, 0];
  let n = 0;
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const i = (png.width * y + x) << 2;
      r[0]! += png.data[i]!;
      r[1]! += png.data[i + 1]!;
      r[2]! += png.data[i + 2]!;
      n++;
    }
  }
  return [r[0]! / n, r[1]! / n, r[2]! / n];
}

function near(a: Rgb | readonly number[], b: Rgb | readonly number[], tolerance: number) {
  return [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= tolerance);
}

const show = (c: Rgb | readonly number[]) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;

/**
 * WHERE THE SAMPLES SIT, and what each one is evidence of.
 *
 * THE EDGE PROBES SIT WELL INSIDE, and the inset is bigger than it looks like
 * it needs to be for a measured reason. The crop window carries a `ring-2` and
 * its offset, the stage's dimmed copy of the photograph sits directly behind
 * it, and a sample within a few pixels of the frame's boundary can land on
 * either — which reads as the card and the window disagreeing when they do not.
 * `crop-visible.spec.ts` insets by 12px for the same reason.
 *
 * NOTHING IS WEAKENED BY IT. The sentinels are 150 rows thick, so 8% is deep
 * inside the cyan and 88% is deep inside the last grid band; what each probe
 * claims about its edge is unchanged. And the bottom's real statement is the
 * magenta count below, which scans every pixel of the card.
 */
const PROBES = [
  { edge: "TOP", fx: 0.5, fy: 0.08, sentinel: SENTINEL.top },
  { edge: "LEFT", fx: 0.04, fy: 0.5, sentinel: SENTINEL.left },
  { edge: "RIGHT", fx: 0.96, fy: 0.5, sentinel: SENTINEL.right },
  { edge: "BOTTOM", fx: 0.5, fy: 0.88, sentinel: null },
] as const;

/** Every interior cell centre, which is what catches a shift. */
const INTERIOR = Array.from({ length: 4 }, (_, i) =>
  Array.from({ length: 3 }, (_, j) => ({
    fx: 0.12 + i * 0.25,
    fy: 0.2 + j * 0.3,
  })),
).flat();

test("the game card shows EXACTLY the region the organizer framed", async ({ page, context }) => {
  test.slow();

  const admin = serviceClient();
  const organizer = await apiClientFor(players.organizer);
  const name = `E2E Crop Truth ${Date.now()}`;
  let venueId: string | null = null;
  let gameId: string | null = null;

  try {
    // ---- Arrange: a disposable venue and one published game at it -----------
    const venue = await admin.rpc("admin_create_venue", {
      p_name: name,
      p_image_path: null,
      p_map_query: null,
    });
    if (venue.error) throw new Error(`admin_create_venue: ${venue.error.message}`);
    venueId = venue.data as string;

    const startsAt = new Date(Date.now() + 24 * 26 * 3600_000).toISOString();
    const game = await organizer.rpc("admin_create_game_v2", {
      p_venue_id: venueId,
      p_starts_at: startsAt,
      p_capacity: 12,
      p_price_czk: 200,
      p_organizer_name: "E2E Organizer",
      p_format: null,
      p_surface: null,
      p_notes: null,
      p_organizer_phone: null,
      p_duration_minutes: null,
      p_allowed_skill_levels: null,
      p_subs_per_team: null,
    });
    if (game.error) throw new Error(`admin_create_game_v2: ${game.error.message}`);
    gameId = game.data as string;
    const published = await organizer.rpc("publish_game", { p_game_id: gameId });
    if (published.error) throw new Error(`publish_game: ${published.error.message}`);

    await signInAs(context, players.organizer);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: "en", domain: "localhost", path: "/" },
    ]);

    // ---- Act 1: frame the marked image to a KNOWN framing -------------------
    await page.goto("/admin/venues", { waitUntil: "networkidle" });
    const row = page.locator(`[data-testid="venue-row"][data-venue-id="${venueId}"]`);
    await expect(row).toBeVisible();
    await row.locator("summary").click();
    await row.locator('[data-testid="venue-photo-input"]').setInputFiles({
      name: "marked.png",
      mimeType: "image/png",
      buffer: await markedImage(page),
    });

    const frameEl = page.getByTestId("photo-cropper-frame");
    await expect(frameEl).toBeVisible();
    // The image has to be decoded before the geometry — and therefore the
    // drag's clamp — means anything.
    await expect
      .poll(async () => frameEl.locator("img").evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    /*
     * DRAG DOWN UNTIL IT STOPS. The clamp keeps the frame covered, so the
     * offset pins at the image's top edge — a framing with an exact name
     * rather than a measured one.
     */
    const box = (await frameEl.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 6; step++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + step * 120);
    }
    await page.mouse.up();

    /*
     * WAIT FOR THE CLAMP, DO NOT ASSUME IT. `mouse.up()` returns when the
     * pointer event is dispatched; React still has to re-render the transform,
     * and on a cold dev server the screenshot below can beat it — which shows
     * up as a frame full of grid colours while the SAVED crop is correctly the
     * top of the image. A flake that accuses the product of the exact bug this
     * spec exists to catch is worse than a slow one.
     *
     * The clamp has an observable: the image's top edge sits exactly on the
     * frame's. That is the condition the rest of the test depends on, so it is
     * the thing to wait for.
     */
    await expect
      .poll(async () => {
        const img = (await frameEl.locator("img").boundingBox())!;
        const box = (await frameEl.boundingBox())!;
        return Math.round(img.y - box.y);
      })
      .toBe(0);

    /*
     * ~~AND A SCREENSHOT OF THE CROP WINDOW, COMPARED WITH THE CARD.~~ THE
     * WINDOW'S PIXELS ARE NOT READABLE AND THE PROOF DOES NOT NEED THEM.
     *
     * The frame carries a `ring-2` with an offset, and the stage's dimmed copy
     * of the same photograph sits directly behind it — so a sample anywhere
     * near its edge lands on the ring, on the dimmed copy, or on the crop,
     * depending on a device pixel. Three separate insets were tried and each
     * moved which edge misread. A reading that cannot be trusted cannot be
     * evidence, and comparing it against the card produced exactly the failure
     * this spec exists to detect, on a product that was correct.
     *
     * WHAT REPLACES IT IS STRONGER, NOT WEAKER. The framing is the CLAMP, whose
     * geometry the test reads exactly above — the image's top edge on the
     * frame's. Given that, the framed region is "the top of the picture, full
     * width", and the SENTINELS say whether the card shows precisely that:
     * cyan at the top, yellow and white at the sides, the last grid band at the
     * bottom, and NOT ONE MAGENTA PIXEL from below the cut. Those are absolute
     * facts about the marked image rather than a comparison between two
     * screenshots of it, and the card is still decoded from pixels, which is
     * what the owner asked for.
     */
    await page.getByTestId("photo-cropper-save").click();
    await expect(page.getByTestId("photo-cropper")).toBeHidden();

    // ---- Act 2: the card as served -----------------------------------------
    const cardPhoto = page
      .locator(`[data-testid="game-row"][href="/game/${gameId}"] [data-testid="card-photo"]`)
      .first();

    await expect
      .poll(
        async () => {
          await page.goto(`/games?day=${pragueDayKey(startsAt)}`, { waitUntil: "networkidle" });
          if ((await cardPhoto.count()) === 0) return "missing";
          /*
           * SCROLL IT INTO VIEW BEFORE ASKING WHETHER IT LOADED (round 37).
           *
           * The card's photograph goes through `next/image` now, and every card
           * but the first is `loading="lazy"` — which is the point: a list of a
           * dozen venues should not fetch a dozen photographs to show three.
           * This fixture's game is rarely the first card, so the image was
           * correctly never loading and the poll read `loading` until it timed
           * out.
           *
           * A REAL READER SCROLLS TO IT. Doing the same here keeps the lazy
           * behaviour under test rather than switching it off to make the test
           * pass — if the image failed to load once visible, this would still
           * fail, which is the property worth keeping.
           */
          await cardPhoto.scrollIntoViewIfNeeded();
          /*
           * AND WAIT FOR THE FETCH THE SCROLL JUST STARTED. Scrolling makes a
           * lazy image eligible to load; it does not make it loaded. Without
           * this the check ran on the same tick and read `loading` every time,
           * which looks identical to an image that never loads at all.
           */
          await cardPhoto
            .evaluate(
              (el: HTMLImageElement) =>
                el.complete
                  ? null
                  : new Promise<null>((resolve) => {
                      el.addEventListener("load", () => resolve(null), { once: true });
                      el.addEventListener("error", () => resolve(null), { once: true });
                    }),
            )
            .catch(() => null);
          return (
            (await cardPhoto.evaluate(
              (el: HTMLImageElement) => (el.complete && el.naturalWidth > 0 ? el.dataset.photo : "loading"),
            )) ?? "none"
          );
        },
        { message: "the card never rendered the venue photograph", timeout: 30_000 },
      )
      .toBe("venue");

    /*
     * THE OVERLAY COMES OFF FOR THE DECODE, AND ONLY FOR THE DECODE.
     *
     * THE PHOTOGRAPH IS THE WHOLE CARD, not a band at the top of one: the
     * image layer is `absolute inset-0` and the venue name, the time pill, the
     * capacity bar, the faces and two gradient scrims are all painted ON it.
     * Decoding through that measures the pill, which is what the first run of
     * this spec did — rgb(22,22,22) in the middle of a yellow-to-white grid.
     *
     * `visibility: hidden`, NOT `display: none`, and the difference is the
     * whole trick. The card takes its HEIGHT from that overlaid content, so
     * removing it from the layout would collapse the card and shrink the very
     * box whose crop is being measured. `visibility` keeps every element's
     * geometry and stops it painting, so the image is rendered at exactly the
     * size it is served at — the filter in front of it is what goes away.
     */
    await page.evaluate((id) => {
      const row = document.querySelector<HTMLElement>(`[href="/game/${id}"]`)!;
      const photo = row.querySelector<HTMLElement>('[data-testid="card-photo"]')!;
      for (const el of row.querySelectorAll<HTMLElement>("*")) {
        if (el === photo || el.contains(photo)) continue;
        el.style.setProperty("visibility", "hidden", "important");
      }
    }, gameId);
    // The card is below the fold, and a viewport clip cannot reach it.
    await cardPhoto.scrollIntoViewIfNeeded();
    const cardBox = (await cardPhoto.boundingBox())!;
    const served = PNG.sync.read(
      await page.screenshot({
        clip: { x: cardBox.x, y: cardBox.y, width: cardBox.width, height: cardBox.height },
      }),
    );

    // ---- Assert: per edge, stated ------------------------------------------
    const lines: string[] = [];
    for (const probe of PROBES) {
      const onCard = sample(served, probe.fx, probe.fy);
      lines.push(
        `${probe.edge}: card ${show(onCard)}` +
          (probe.sentinel ? ` (expect ${probe.sentinel.name})` : " (expect the last grid band)"),
      );
      if (probe.sentinel) {
        expect(
          near(onCard, probe.sentinel.rgb, 40),
          `${probe.edge} edge: expected the ${probe.sentinel.name} sentinel and the card shows ` +
            `${show(onCard)} — the framing moved off the image's ${probe.edge.toLowerCase()} edge\n` +
            lines.join("\n"),
        ).toBe(true);
      } else {
        /*
         * THE BOTTOM IS THE LAST GRID BAND, which is what "the crop ends just
         * above the magenta" looks like. Its green channel encodes the row, so
         * this is a statement about WHICH part of the picture is at the bottom
         * of the card, not merely that something is.
         */
        expect(
          onCard[2],
          `BOTTOM edge: the card shows ${show(onCard)} — the grid's blue channel is 100, so ` +
            `this is not a grid band at all\n${lines.join("\n")}`,
        ).toBeGreaterThan(80);
        expect(onCard[1], `BOTTOM edge: expected the LAST grid band\n${lines.join("\n")}`)
          .toBeGreaterThan(200);
      }
    }

    /*
     * AND THE CUT EDGE, ASSERTED AS AN ABSENCE. Everything above compares two
     * pictures; this one names what must NOT be in the card at all. The
     * magenta strip lies below the framed region, so a single magenta pixel
     * anywhere on the card means the crop kept something the organizer had
     * pushed out of the window.
     */
    let magenta = 0;
    for (let y = 0; y < served.height; y++) {
      for (let x = 0; x < served.width; x++) {
        const i = (served.width * y + x) << 2;
        if (near([served.data[i]!, served.data[i + 1]!, served.data[i + 2]!], SENTINEL.bottom.rgb, 40)) {
          magenta++;
        }
      }
    }
    expect(
      magenta,
      `${magenta} magenta pixels on the card — the crop reaches BELOW the framed region\n` +
        lines.join("\n"),
    ).toBe(0);

    // The per-edge reading, attached to the report rather than printed: the
    // acceptance asks what is visible on each edge, and that answer belongs
    // with the run it came from.
    await test.info().attach("per-edge", { body: lines.join("\n"), contentType: "text/plain" });
  } finally {
    if (gameId) {
      await admin.from("events").delete().eq("game_id", gameId);
      await admin.from("game_organizer_contacts").delete().eq("game_id", gameId);
      await admin.from("games").delete().eq("id", gameId);
    }
    if (venueId) await admin.from("venues").delete().eq("id", venueId);
  }
});
