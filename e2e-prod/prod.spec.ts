import { expect, test, devices } from "@playwright/test";

const B = "https://hrajfotbalek-wlya.vercel.app";
test.use({ ...devices["Pixel 7"] });

/**
 * DOES A `loading.tsx` MAKE A TAP PAINT SOONER? A live A/B on ONE deployment,
 * because the previous deploy's URL sits behind deployment protection and
 * cannot be driven anonymously.
 *
 * Both destinations are `force-dynamic` and both are reached by a `<Link>` from
 * `/games`, so prefetch, network and region are held still. The only difference
 * is that `/` has a loading boundary and `/pass` does not.
 *
 * THE MARKER MUST BELONG TO THE DESTINATION. A first attempt waited for
 * `location.pathname` plus "main has some text", and measured 68ms against
 * 63ms — which was the URL changing while the OLD page was still mounted, not
 * anything painting. Every wait below names something only the destination can
 * render.
 */
async function tapToPaint(page: import("@playwright/test").Page, selector: string, marker: string) {
  await page.goto(`${B}/games`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);         // let viewport prefetches land
  const t0 = Date.now();
  await page.locator(selector).first().click();
  await page.waitForSelector(marker, { state: "attached", timeout: 20000 });
  return Date.now() - t0;
}

test("loading boundary A/B, three runs each", async ({ page }) => {
  const withB: number[] = [];
  const withoutB: number[] = [];
  for (let i = 0; i < 3; i++) {
    // `/` paints either its skeleton (role=status, only the boundary renders one)
    // or its real hero — whichever arrives first is the first paint.
    withB.push(await tapToPaint(page, '[data-testid="brand-mark"]', '[role="status"], [data-testid="hero-headline"]'));
    // `/pass` has no boundary, so its first paint can only be its real content.
    withoutB.push(await tapToPaint(page, 'a[href="/pass"]', '[data-testid="credit-equivalence"]'));
  }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[1];
  console.log(`BOUNDARY  /     (has loading.tsx) runs=${withB} median=${med(withB)}ms`);
  console.log(`BOUNDARY  /pass (no boundary)     runs=${withoutB} median=${med(withoutB)}ms`);
  expect(true).toBe(true);
});
