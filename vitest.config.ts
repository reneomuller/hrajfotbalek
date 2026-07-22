import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // E2E lives in `e2e/` and is driven by Playwright, not Vitest.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // `scripts/**/*.check.ts` talks to the live database and needs .env.local;
    // it runs from vitest.integration.config.ts instead. This suite must stay
    // runnable with no credentials.
    exclude: ["node_modules/**", ".next/**", "e2e/**", "scripts/**"],
  },
});
