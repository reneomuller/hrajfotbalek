import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { BRAND_MARK_PX, renderBrandImage } from "@/lib/og/brandImage";
import { OG_SIZE } from "@/lib/og/theme";

/**
 * The share card for every link that is not a game (2026-11-02, the owner's
 * pick: draft C, "kick-off", with B's alignment on the left).
 *
 * MEASURED BY DECODING, like every other claim about pixels here. "The left
 * block has `alignItems: flex-start`" would pass for a layout that still drew
 * the words flush right; the left edges of the drawn letters cannot.
 */
type Pixel = [number, number, number];

let png: PNG;
const at = (x: number, y: number): Pixel => {
  const i = (y * png.width + x) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
};
const isWhite = ([r, g, b]: Pixel) => r >= 230 && g >= 230 && b >= 230;
const isVolt = ([r, g, b]: Pixel) => r >= 170 && g >= 230 && b <= 70;
/** The roundel's ring is the artwork's own lime (~165,215,3), softer than volt. */
const isMarkLime = ([r, g, b]: Pixel) => r >= 120 && g >= 180 && b <= 40;

/** Left edge of each text line drawn in `match` between x0 and x1, top to bottom. */
function lineLeftEdges(match: (p: Pixel) => boolean, x0: number, x1: number): number[] {
  const lines: { left: number }[] = [];
  let inLine = false;
  for (let y = 0; y < png.height; y++) {
    let left = -1;
    for (let x = x0; x < x1; x++) {
      if (match(at(x, y))) {
        left = x;
        break;
      }
    }
    if (left < 0) {
      inLine = false;
      continue;
    }
    if (!inLine) lines.push({ left });
    inLine = true;
    lines[lines.length - 1]!.left = Math.min(lines[lines.length - 1]!.left, left);
  }
  return lines.map((l) => l.left);
}

const CENTRE_X = OG_SIZE.width / 2;
const CENTRE_Y = OG_SIZE.height / 2;
const MARK_R = BRAND_MARK_PX / 2;

describe("the brand share card", () => {
  beforeAll(async () => {
    const response = renderBrandImage();
    png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  });

  it("is the size every preview client expects", () => {
    expect({ width: png.width, height: png.height }).toEqual(OG_SIZE);
  });

  it("left-aligns the two words of the brand line, as in draft B", () => {
    // Arrange: everything left of the mark, white letters only.
    const edges = lineLeftEdges(isWhite, 0, CENTRE_X - MARK_R - 4);

    // Assert: two lines ("HRAJ", "FOTBAL."), one shared left edge.
    expect(edges).toHaveLength(2);
    expect(Math.abs(edges[0]! - edges[1]!)).toBeLessThanOrEqual(2);
  });

  it("left-aligns the volt line on the other side of halfway", () => {
    const edges = lineLeftEdges(isVolt, CENTRE_X + MARK_R + 4, png.width);

    expect(edges).toHaveLength(2);
    expect(Math.abs(edges[0]! - edges[1]!)).toBeLessThanOrEqual(2);
  });

  it("puts the mark on the centre spot, so a square crop still shows it", () => {
    // The roundel's ring, sampled at its four compass points.
    const ring = (dx: number, dy: number) => {
      for (let r = MARK_R - 18; r <= MARK_R; r++) {
        if (isMarkLime(at(Math.round(CENTRE_X + dx * r), Math.round(CENTRE_Y + dy * r)))) return true;
      }
      return false;
    };

    expect([ring(1, 0), ring(-1, 0), ring(0, 1), ring(0, -1)]).toEqual([true, true, true, true]);
  });
});
