import type { MetadataRoute } from "next";
import { robotsFor } from "@/lib/seo/site";
import { siteUrl } from "@/lib/site";

/** `/robots.txt` — see `lib/seo/site.ts`. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return robotsFor(await siteUrl());
}
