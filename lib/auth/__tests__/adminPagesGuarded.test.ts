import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY ADMIN PAGE CHECKS ITS OWN VISITOR (found on production, 2026-11-08).
 *
 * `app/admin/layout.tsx` calls `requireAdmin()`, and the layout's comment
 * calls it "the gate for every route beneath this layout". It is not: the App
 * Router renders a layout and its page IN PARALLEL, so a page that reads with
 * the service role streams its rows into the response while the layout is
 * still redirecting. A signed-out `curl https://www.hrajfotbal.com/admin/games`
 * came back with every game row in the payload behind a `NEXT_REDIRECT` to
 * /login. Every other admin page already called `requireAdmin()` itself; the
 * games list never had, since round 13.
 *
 * So the rule is mechanical: a page under app/admin either calls
 * `requireAdmin()` or only redirects.
 */
const ADMIN = path.join(process.cwd(), "app/admin");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

const onlyRedirects = (source: string) =>
  /\bredirect\(/.test(source) && !/from "@\/lib\/admin\//.test(source) && !/\.from\(|\.rpc\(/.test(source);

describe("admin pages", () => {
  it.each(pages(ADMIN).map((file) => [path.relative(process.cwd(), file), file]))(
    "%s checks the visitor is an admin before it reads anything",
    (_name, file) => {
      // Arrange
      const source = readFileSync(file, "utf8");

      // Act
      const guarded = /\brequireAdmin\(\)/.test(source) || onlyRedirects(source);

      // Assert
      expect(guarded).toBe(true);
    },
  );
});
