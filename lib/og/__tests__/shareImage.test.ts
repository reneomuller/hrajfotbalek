import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { resolveStrings } from "@/lib/i18n/resolve";
import { SHARE_IMAGE_BUDGET_BYTES, SHARE_PHOTO_SIZE, renderShareImage, toShareJpeg } from "@/lib/og/shareImage";
import { storyAvailability, storyFacts } from "@/lib/og/storyFacts";
import { OG_SIZE } from "@/lib/og/theme";

/**
 * A game's link preview — the card WhatsApp draws above a shared game link —
 * as the 9:16 story laid on its side (2026-11-17, the owner: "update these to
 * better reflect the instagram visual").
 *
 * MEASURED BY DECODING, like every other claim about pixels here.
 */
type Pixel = [number, number, number];

const t = resolveStrings("cs");

/** A photo of one flat colour, so where it shows can be read back. */
async function flatPhoto(rgb: { r: number; g: number; b: number }): Promise<string> {
  const jpeg = await sharp({ create: { ...SHARE_PHOTO_SIZE, channels: 3, background: rgb } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function draw(overrides: { bookedCount?: number; capacity?: number; venueName?: string; photoDataUri?: string | null }) {
  const bookedCount = overrides.bookedCount ?? 2;
  const capacity = overrides.capacity ?? 15;
  return renderShareImage({
    venueName: overrides.venueName ?? "ŽŠ Botičská",
    startsAt: "2026-11-21T15:00:00Z",
    facts: storyFacts({ format: "5v5", durationMinutes: 90 }, t),
    availability: storyAvailability({ bookedCount, capacity }, "cs", t),
    bookedCount,
    capacity,
    photoDataUri: overrides.photoDataUri === undefined ? await flatPhoto({ r: 255, g: 0, b: 255 }) : overrides.photoDataUri,
    locale: "cs",
    t,
  });
}

async function decode(image: Response): Promise<{ png: PNG; at: (x: number, y: number) => Pixel }> {
  const png = PNG.sync.read(Buffer.from(await image.arrayBuffer()));
  const at = (x: number, y: number): Pixel => {
    const i = (y * png.width + x) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  };
  return { png, at };
}

const isMagenta = ([r, g, b]: Pixel) => r >= 200 && g <= 60 && b >= 200;
const isInk = ([r, g, b]: Pixel) => r <= 16 && g <= 16 && b <= 16;
const isVolt = ([r, g, b]: Pixel) => r >= 170 && g >= 230 && b <= 70;
/** `surface-seg`, the empty notch (#242424). */
const isEmptyNotch = ([r, g, b]: Pixel) => Math.abs(r - 0x24) <= 6 && Math.abs(g - 0x24) <= 6 && Math.abs(b - 0x24) <= 6;

/** Runs of at least `minWidth` matching pixels along row `y`. */
function runs(at: (x: number, y: number) => Pixel, y: number, match: (p: Pixel) => boolean, minWidth: number): number {
  let count = 0;
  let width = 0;
  for (let x = 0; x <= OG_SIZE.width; x++) {
    if (x < OG_SIZE.width && match(at(x, y))) {
      width++;
      continue;
    }
    if (width >= minWidth) count++;
    width = 0;
  }
  return count;
}

/**
 * The rows that draw a capacity bar — one notch per spot, filled or empty — as
 * [filled, empty] counts. Counting to `capacity` keeps the volt date line,
 * whose strokes are runs too, out of it.
 */
function barRows(at: (x: number, y: number) => Pixel, capacity: number): [number, number][] {
  const rows: [number, number][] = [];
  for (let y = 0; y < OG_SIZE.height; y++) {
    const filled = runs(at, y, isVolt, 10);
    const empty = runs(at, y, isEmptyNotch, 10);
    if (filled + empty === capacity) rows.push([filled, empty]);
  }
  return rows;
}

describe("the game link preview", () => {
  it("is the size every preview client expects", async () => {
    // Act
    const { png } = await decode(await draw({}));

    // Assert
    expect({ width: png.width, height: png.height }).toEqual(OG_SIZE);
  });

  it("shows the venue's photo at the top right, and keeps the words on ink at the left and the foot", async () => {
    // Act
    const { at } = await decode(await draw({}));

    // Assert
    expect(isMagenta(at(1150, 60))).toBe(true);
    expect(isMagenta(at(1000, 200))).toBe(true);
    expect(isInk(at(20, OG_SIZE.height / 2))).toBe(true);
    expect(isInk(at(1180, OG_SIZE.height - 10))).toBe(true);
  });

  it("draws one notch per spot, the booked ones in the availability's tone", async () => {
    // Act — two of fifteen booked: thirteen left, which is volt.
    const { at } = await decode(await draw({ bookedCount: 2, capacity: 15 }));

    // Assert
    expect(barRows(at, 15)).toContainEqual([2, 13]);
  });

  it("draws no bar at all while nobody has booked — the story's rule", async () => {
    // Act
    const { at } = await decode(await draw({ bookedCount: 0 }));

    // Assert
    expect(barRows(at, 15)).toEqual([]);
  });

  it("keeps a long venue name inside the card's margin", async () => {
    // Arrange — on a black photo, anything white at the right edge is the name.
    const photoDataUri = await flatPhoto({ r: 0, g: 0, b: 0 });

    // Act
    const { at } = await decode(await draw({ venueName: "Sportovní areál Praha 3 • Pražačka hřiště B", photoDataUri }));

    // Assert
    const whiteAtTheEdge = [];
    for (let y = 0; y < OG_SIZE.height; y++) {
      for (let x = OG_SIZE.width - 40; x < OG_SIZE.width; x++) {
        const [r, g, b] = at(x, y);
        if (r > 200 && g > 200 && b > 200) whiteAtTheEdge.push([x, y]);
      }
    }
    expect(whiteAtTheEdge).toEqual([]);
  });

  /*
   * The owner, on the first preview: "move the green text above the large white
   * text a little higher, so the special characters above the white text have
   * the same amount of room between the green text (same amount of room the no
   * special character ones have now ...) for all to remain consistent".
   */
  describe("the room between the date and the venue", () => {
    /** Above a plain capital, in the preview the owner approved (2026-11-17), at the full 112px. */
    const APPROVED_ROOM_PX = 26;

    /** The date's lowest volt row, and the venue's highest white row under it. */
    async function room(venueName: string): Promise<{ dateBottom: number; room: number }> {
      const { at } = await decode(await draw({ venueName, photoDataUri: await flatPhoto({ r: 0, g: 0, b: 0 }) }));
      const rowHas = (y: number, match: (p: Pixel) => boolean) => {
        for (let x = 56; x < 1000; x++) if (match(at(x, y))) return true;
        return false;
      };
      const isWhite = ([r, g, b]: Pixel) => r > 200 && g > 200 && b > 200;
      // Below the pill (whose wordmark is white and volt too), above the tiles.
      let dateBottom = -1;
      for (let y = 140; y < 470; y++) if (rowHas(y, isVolt)) dateBottom = y;
      let venueTop = -1;
      for (let y = 140; y < 470 && venueTop < 0; y++) if (rowHas(y, isWhite)) venueTop = y;
      return { dateBottom, room: venueTop - dateBottom - 1 };
    }

    it("gives a háček and a čárka the room a plain capital had", async () => {
      // Act — both names draw at the full size.
      const accented = await room("ŽŠ Botičská");

      // Assert
      expect(Math.abs(accented.room - APPROVED_ROOM_PX)).toBeLessThanOrEqual(1);
    });

    it("puts the date at one height whether or not the name carries an accent", async () => {
      // Act
      const [plain, accented] = await Promise.all([room("Gutovka Fotbal"), room("ŽŠ Botičská")]);

      // Assert
      expect(plain.dateBottom).toBe(accented.dateBottom);
    });
  });

  it("draws the pitch lines, not an empty frame, for a venue with no photo", async () => {
    // Act
    const { at } = await decode(await draw({ photoDataUri: null }));

    // Assert — some faint volt line crosses the upper right.
    let lit = 0;
    for (let y = 0; y < 300; y++) {
      for (let x = 700; x < OG_SIZE.width; x++) {
        const [r, g, b] = at(x, y);
        if (g > r && g > 40 && b < g / 2) lit++;
      }
    }
    expect(lit).toBeGreaterThan(200);
  });
});

describe("toShareJpeg", () => {
  it("fits a real venue photo inside the size WhatsApp will still preview", async () => {
    // Arrange — a committed venue photograph, drawn at the size the card draws it.
    const photo = await sharp(readFileSync(join(process.cwd(), "public/venues/prazacka.png")))
      .resize({ ...SHARE_PHOTO_SIZE, fit: "cover" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const image = await draw({ photoDataUri: `data:image/jpeg;base64,${photo.toString("base64")}` });

    // Act
    const jpeg = await toShareJpeg(image);

    // Assert
    const meta = await sharp(jpeg).metadata();
    expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({ format: "jpeg", ...OG_SIZE });
    expect(jpeg.byteLength).toBeLessThan(SHARE_IMAGE_BUDGET_BYTES);
  });
});
