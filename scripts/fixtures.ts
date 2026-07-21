/**
 * Seed fixture definitions (v1).
 *
 * Every id is a fixed UUID rather than a generated one. That is what makes
 * `reset` exact: it deletes precisely these rows and nothing else, so running
 * the seed against a database that also holds real data cannot take the real
 * data with it. It is also what makes reseeding idempotent.
 *
 * SCOPE:
 *   - Waitlist rows ARE seeded as of Phase 17, created by calling
 *     `join_waitlist` under a real session — never by direct insert, on the
 *     same reasoning that governs every other fixture here. Phase 19 stamps
 *     `notified_at` on one of them through `notify_waitlist`, so the
 *     re-notification path and the waitlist-depth metric have realistic data.
 *   - No synthetic `events` rows. Every event in the database after a seed was
 *     written by an RPC as part of a real state transition. The auth-funnel
 *     events (auth_link_sent / auth_completed / account_created /
 *     player_claimed) come from ONE REAL SIGNUP at the gate, not from here.
 */

export interface PlayerFixture {
  id: string;
  nickname: string;
  email: string | null;
  phone: string | null;
  isAdmin: boolean;
  isSeed: boolean;
  /** true => an auth user is created so this player can hold a real session. */
  needsSession: boolean;
}

export interface GameFixture {
  id: string;
  venue: string;
  /** Hours from now at insert time. Positive = future. */
  startsInHours: number;
  capacity: number;
  priceCzk: number;
}

/** Shared password for seeded auth users. Dev fixtures only. */
export const SEED_PASSWORD = "seed-password-hrajfotbal-v1";

export const players = {
  organizer: {
    id: "5eed0000-0000-0000-0000-00000000a001",
    nickname: "Organizer",
    email: "organizer@seed.hrajfotbal.test",
    phone: "+420600000001",
    isAdmin: true,
    isSeed: false,
    needsSession: true,
  },
  runner: {
    id: "5eed0000-0000-0000-0000-00000000a002",
    nickname: "RealRunner",
    email: "runner@seed.hrajfotbal.test",
    phone: "+420600000002",
    isAdmin: false,
    isSeed: false,
    needsSession: true,
  },
  creditRich: {
    id: "5eed0000-0000-0000-0000-00000000a003",
    nickname: "CreditRich",
    email: "credit-rich@seed.hrajfotbal.test",
    phone: "+420600000003",
    isAdmin: false,
    isSeed: false,
    needsSession: true,
  },
  creditPartial: {
    id: "5eed0000-0000-0000-0000-00000000a004",
    nickname: "CreditPartial",
    email: "credit-partial@seed.hrajfotbal.test",
    phone: "+420600000004",
    isAdmin: false,
    isSeed: false,
    needsSession: true,
  },
  seedBot: {
    id: "5eed0000-0000-0000-0000-00000000a005",
    nickname: "SeedBot",
    email: "seed-bot@seed.hrajfotbal.test",
    phone: null,
    isAdmin: false,
    // Drives the seed_free derivation. The script never names that method.
    isSeed: true,
    needsSession: true,
  },
  shadowWithEmail: {
    id: "5eed0000-0000-0000-0000-00000000a006",
    nickname: "ShadowWithEmail",
    // Claimable at first login by exact email match.
    email: "shadow-claimable@seed.hrajfotbal.test",
    phone: "+420600000006",
    isAdmin: false,
    isSeed: false,
    needsSession: false,
  },
  shadowNoEmail: {
    id: "5eed0000-0000-0000-0000-00000000a007",
    nickname: "ShadowNoEmail",
    // Never auto-claimable by any login — admin merge only (Phase 25).
    email: null,
    phone: "+420600000007",
    isAdmin: false,
    isSeed: false,
    needsSession: false,
  },
} satisfies Record<string, PlayerFixture>;

export const games = {
  draft: {
    id: "5eed0000-0000-0000-0000-00000000b001",
    venue: "Praha 3 — Pražačka (draft)",
    startsInHours: 24 * 10,
    capacity: 12,
    priceCzk: 200,
  },
  published: {
    id: "5eed0000-0000-0000-0000-00000000b002",
    venue: "Praha 3 — Pražačka",
    startsInHours: 24 * 5,
    capacity: 12,
    priceCzk: 200,
  },
  full: {
    id: "5eed0000-0000-0000-0000-00000000b003",
    venue: "Praha 7 — Letná",
    startsInHours: 24 * 6,
    capacity: 2,
    priceCzk: 200,
  },
  played: {
    id: "5eed0000-0000-0000-0000-00000000b004",
    venue: "Praha 4 — Podolí",
    startsInHours: 24 * 3,
    capacity: 12,
    priceCzk: 200,
  },
  settled: {
    id: "5eed0000-0000-0000-0000-00000000b005",
    venue: "Praha 8 — Libeň",
    startsInHours: 24 * 4,
    capacity: 12,
    priceCzk: 200,
  },
  cancelled: {
    id: "5eed0000-0000-0000-0000-00000000b006",
    venue: "Praha 10 — Strašnice",
    startsInHours: 24 * 7,
    capacity: 12,
    priceCzk: 200,
  },
  /** Where wallet credit is minted, via real overpayment confirmations. */
  creditSource: {
    id: "5eed0000-0000-0000-0000-00000000b007",
    venue: "Praha 5 — Smíchov",
    startsInHours: 24 * 8,
    capacity: 12,
    priceCzk: 200,
  },
  /** Holds the expired-booking fixture. */
  expiry: {
    id: "5eed0000-0000-0000-0000-00000000b008",
    venue: "Praha 6 — Dejvice",
    startsInHours: 24 * 9,
    capacity: 12,
    priceCzk: 200,
  },
  /**
   * Output-escaping fixture. `venue` is admin-supplied free text that reaches
   * three different grammars — HTML text, the OG `content` attribute, and
   * iCalendar TEXT — and each escapes differently. This venue carries a payload
   * for all three at once: HTML tags and quotes, an iCalendar comma/semicolon/
   * backslash, and a newline. It must render as literal text everywhere and
   * must never execute or break a field boundary.
   */
  hostileVenue: {
    id: "5eed0000-0000-0000-0000-00000000b009",
    venue: '<script>alert(1)</script> "Praha 2", a;b\\c',
    startsInHours: 24 * 11,
    capacity: 12,
    priceCzk: 200,
  },
} satisfies Record<string, GameFixture>;

export const allPlayerIds = Object.values(players).map((p) => p.id);
export const allGameIds = Object.values(games).map((g) => g.id);
export const allPlayerEmails = Object.values(players)
  .map((p) => p.email)
  .filter((e): e is string => typeof e === "string");
