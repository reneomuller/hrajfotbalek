import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration checks that talk to the LIVE database.
 *
 * Separate from `vitest.config.ts` on purpose: these need `.env.local`, they
 * create and delete real rows, and they are slow. The unit suite must stay
 * runnable with no credentials at all, so `*.check.ts` is excluded there and
 * collected only here.
 *
 *   node --env-file=.env.local ./node_modules/vitest/vitest.mjs run \
 *     --config vitest.integration.config.ts
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/**/*.check.ts"],
  },
});
