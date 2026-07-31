import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Ship `content/` with the server bundle.
   *
   * `/terms` reads its markdown at request time with
   * `readFileSync(path.resolve(process.cwd(), "content", …))`. Next's
   * dependency tracing follows imports, and that path is assembled at runtime —
   * so nothing tells the build those files are needed, and the deployed
   * function gets a `content/` directory that does not exist.
   *
   * Worth a config entry rather than a comment because of how it fails: it
   * works perfectly under `next dev`, where the whole repo is on disk, and
   * 500s the first time someone opens the terms in production. No test that
   * runs locally can see it.
   */
  outputFileTracingIncludes: {
    "/terms": ["./content/**"],
  },
};

export default nextConfig;
