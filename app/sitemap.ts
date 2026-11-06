import type { MetadataRoute } from "next";
import { sitemapFor } from "@/lib/seo/site";
import { siteUrl } from "@/lib/site";

/** `/sitemap.xml` — see `lib/seo/site.ts`. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapFor(await siteUrl());
}
