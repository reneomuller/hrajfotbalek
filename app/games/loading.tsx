import { GamesListSkeleton } from "@/components/game/GameCardSkeleton";

/**
 * Route-level loading UI for `/games`.
 *
 * Next renders this from the server while the page's own data resolves, so it
 * costs no client JavaScript and appears on the first navigation rather than
 * after hydration.
 */
export default function Loading() {
  return <GamesListSkeleton />;
}
