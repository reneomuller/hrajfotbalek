import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  // Email templates are JSX rendered with react-dom/server; esbuild needs the
  // automatic runtime to transform them under vitest.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // E2E lives in `e2e/` and is driven by Playwright, not Vitest.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
});
