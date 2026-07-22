import type { MetadataRoute } from "next";
import tailwindConfig from "@/tailwind.config";
import { strings } from "@/lib/strings";

const themeColors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, string>;

/**
 * PWA manifest.
 *
 * Scope is deliberately small: install artifacts only — icon, name, splash
 * colours, standalone display. There is NO service worker and no offline
 * caching anywhere in this project, and adding one would buy a cache
 * invalidation problem in exchange for nothing a booking app wants (a stale
 * cached roster is worse than a spinner).
 *
 * The manifest stays English even though the UI speaks three languages: it is
 * read once at install time by the OS, cannot re-render on a language switch,
 * and the brand name is the same word in all three.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: strings.meta.title,
    short_name: "Hraj Fotbal",
    description: strings.meta.description,
    start_url: "/games",
    display: "standalone",
    background_color: themeColors.ink,
    theme_color: themeColors.ink,
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
