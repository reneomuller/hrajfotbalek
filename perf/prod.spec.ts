import { expect, test } from "@playwright/test";

/**
 * ROUND 37, ITEM 1 — THE MEASUREMENTS, RUN AGAINST THE DEPLOYED PRODUCT.
 *
 * See `perf/README.md` for what each number means and how to run it. Nothing
 * here asserts; a performance harness that fails a build teaches people to
 * ignore it, and every threshold worth enforcing belongs in the E2E suite where
 * it can be enforced deterministically (`e2e/tap-feedback.spec.ts` is the one
 * that earned that).
 */

const BASE = process.env.PERF_BASE ?? "https://hrajfotbalek-wlya.vercel.app";

/** A published game to measure the detail route on, discovered rather than pinned. */
async function anyGameId(request: import("@playwright/test").APIRequestContext): Promise<string | null> {
  const html = await (await request.get(`${BASE}/games`)).text();
  return html.match(/\/game\/([0-9a-f-]{36})/)?.[1] ?? null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

test("region, TTFB and payload", async ({ request }) => {
  // --- (a) which region actually executes ------------------------------------
  const head = await request.get(`${BASE}/`);
  const id = head.headers()["x-vercel-id"] ?? "(none)";
  const [edge, fn] = id.split("::");
  console.log(`REGION edge=${edge} function=${fn}  (raw ${id})`);

  // --- (b) TTFB per journey, cold and warm -----------------------------------
  const gameId = await anyGameId(request);
  const journeys: [string, string][] = [
    ["home", "/"],
    ["games list", "/games"],
    ...((gameId ? [["game detail", `/game/${gameId}`], ["booking open", `/game/${gameId}/book`]] : []) as [string, string][]),
    ["account (guarded)", "/account"],
    ["pass", "/pass"],
  ];

  for (const [label, path] of journeys) {
    const samples: number[] = [];
    for (let i = 0; i < 9; i++) {
      const started = Date.now();
      const res = await request.get(`${BASE}${path}`, { maxRedirects: 0, failOnStatusCode: false });
      await res.body();
      samples.push(Date.now() - started);
    }
    console.log(
      `TTFB ${label.padEnd(20)} median=${String(median(samples)).padStart(5)}ms  ` +
        `cold=${samples[0]}ms  min=${Math.min(...samples)}ms`,
    );
  }

  // The client-to-edge floor, so the numbers above can be read as server time.
  const assetHtml = await (await request.get(`${BASE}/games`)).text();
  const asset = assetHtml.match(/\/_next\/static\/[^"]+\.js/)?.[0];
  if (asset) {
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = Date.now();
      await (await request.get(`${BASE}${asset}`)).body();
      samples.push(Date.now() - started);
    }
    console.log(`STATIC baseline (edge cache HIT)  median=${median(samples)}ms`);
  }

  expect(id).not.toBe("(none)");
});

test("image payload on the games list", async ({ page }) => {
  let bytes = 0;
  const rows: string[] = [];
  page.on("response", (response) => {
    if (!(response.headers()["content-type"] ?? "").startsWith("image/")) return;
    const length = Number(response.headers()["content-length"] ?? 0);
    bytes += length;
    const url = new URL(response.url());
    const file = decodeURIComponent(url.searchParams.get("url") ?? url.pathname).split("/").pop();
    rows.push(`${String(length).padStart(7)}  w=${(url.searchParams.get("w") ?? "-").padEnd(5)} ${file}`);
  });

  await page.goto(`${BASE}/games`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);   // lazy images below the first card
  for (const row of rows) console.log(`IMAGE ${row}`);
  console.log(`IMAGES total=${bytes} files=${rows.length}`);
  expect(rows.length).toBeGreaterThan(0);
});

test("tap to first paint, and whether prefetch is on", async ({ page }) => {
  const prefetched = new Set<string>();
  page.on("request", (r) => {
    if (r.headers()["next-router-prefetch"] === "1") prefetched.add(new URL(r.url()).pathname);
  });

  /*
   * BOTH LEGS ARE ASKED THE SAME QUESTION: when does the DESTINATION first put
   * anything on screen — its skeleton or its content, whichever wins. Waiting
   * for `location.pathname` instead measures the router, which changes the URL
   * while the previous page is still mounted.
   */
  async function tapToPaint(selector: string, marker: string): Promise<number> {
    await page.goto(`${BASE}/games`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);        // let the viewport prefetches land
    const started = Date.now();
    await page.locator(selector).first().click();
    await page.waitForSelector(marker, { state: "attached", timeout: 20_000 });
    return Date.now() - started;
  }

  const home: number[] = [];
  const pass: number[] = [];
  for (let i = 0; i < 3; i++) {
    home.push(await tapToPaint('[data-testid="brand-mark"]', '[role="status"], [data-testid="hero-headline"]'));
    pass.push(await tapToPaint('a[href="/pass"]', '[role="status"], [data-testid="credit-equivalence"]'));
  }
  console.log(`TAP home  median=${median(home)}ms  runs=${home}`);
  console.log(`TAP pass  median=${median(pass)}ms  runs=${pass}`);
  console.log(`PREFETCH ${prefetched.size} routes: ${[...prefetched].sort().join(" ")}`);

  expect(home.length).toBe(3);
});
