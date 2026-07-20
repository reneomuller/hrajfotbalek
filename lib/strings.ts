/**
 * Centralized UI strings. No hardcoded user-visible copy may appear in a
 * component — every surface reads from here.
 *
 * Values are English: CZ/RU translations are explicitly out of Phase 1 scope,
 * so this is a flat string table rather than an i18n catalogue. The shape is
 * nested by surface so a future i18n layer can swap the table wholesale.
 */
export const strings = {
  meta: {
    title: "Hraj Fotbal — pickup football in Prague",
    description:
      "One match that repeats itself. Find a game, claim your spot, show up.",
  },

  brand: {
    wordmarkLead: "HRAJ",
    wordmarkAccent: "FOTBAL",
    monogramLead: "H",
    monogramAccent: "F",
  },

  nav: {
    cta: "Claim your spot",
  },

  landing: {
    liveBadge: "LIVE · PRAGUE 3 — PRAŽAČKA",
    headlineLead: "HRAJ",
    headlineAccent: "FOTBAL",
    heroSub: "Join in and have fun.",
    vision:
      "One match that repeats itself. Find a game, claim your spot, show up.",
    heroCta: "Find a game →",
    scrollHint: "↓ SCROLL",
    steps: [
      {
        index: "01",
        title: "FIND A GAME",
        body: "Matches near you, every week.",
      },
      {
        index: "02",
        title: "CLAIM YOUR SPOT",
        body: "Enter a nickname and you are in the lineup.",
      },
      {
        index: "03",
        title: "SHOW UP AND PLAY",
        body: "Pay ahead from your phone. Done.",
      },
    ],
    nextMatchEyebrow: "//",
    nextMatchLabel: "NEXT MATCH",
    nextMatchPlaceholder: "Loading the next match…",

    pay: {
      title: "PAY AHEAD",
      body: "Scan the code and pay from your phone. The spot is yours.",
      perGame: "/ game",
    },

    community: {
      title: "JOIN THE COMMUNITY",
      body: "New games every week. Follow along and play.",
      whatsapp: "WHATSAPP GROUP",
      whatsappUrl: "https://chat.whatsapp.com/LjPjGf3rf32CNifizwzsW9?mode=gi_t",
      instagram: "@HRAJFOTBAL",
      instagramUrl: "https://instagram.com/hrajfotbal",
    },

    footer: {
      wordmarkLead: "HRAJ",
      wordmarkAccent: "FOTBAL",
      city: "· PRAGUE",
      tagline: "COME FOR THE GAME · STAY FOR THE CREW",
    },
  },

  auth: {
    loginTitle: "Sign in",
    loginLede: "We email you a link. No password to remember.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    sendLink: "Send me a link",
    linkSent: "Check your inbox — the link is on its way.",
    linkExpired: "That link has expired. Request a new one.",
    signOut: "Sign out",
  },

  games: {
    listTitle: "Upcoming games",
    empty: "No games scheduled yet. Check back soon.",
    spotsLeft: "spots left",
    full: "Full",
    joinWaitlist: "Join the waitlist",
    onWaitlist: "You are on the waitlist",
    rosterTitle: "Lineup",
    rosterEmpty: "No one has claimed a spot yet.",
    cancelled: "This game was cancelled.",
  },

  booking: {
    claimSpot: "Claim your spot",
    nicknameLabel: "Nickname",
    nicknameHint: "Letters, numbers, spaces, _ and - · up to 20 characters",
    payByQr: "Pay by QR",
    payByCash: "Pay cash on the pitch",
    confirmBooking: "Confirm booking",
    reserved: "Spot reserved",
    confirmed: "Payment confirmed",
    creditApplied: "Credit applied",
    amountDue: "Amount due",
    cancelBooking: "Cancel my booking",
    cancelConfirm: "Cancel this booking? Your credit is returned to your wallet.",
    cancelled: "Booking cancelled",
    addToCalendar: "Add to calendar",
    share: "Share",
  },

  payment: {
    qrTitle: "Scan to pay",
    qrHint: "Open your banking app and scan. The payment identifies itself.",
    variableSymbol: "Variable symbol",
    amount: "Amount",
    paidAlready: "I have paid",
    pendingConfirmation: "Waiting for the organizer to confirm your payment.",
  },

  account: {
    title: "My account",
    myBookings: "My bookings",
    noBookings: "You have no bookings yet.",
    creditBalance: "Credit balance",
    creditEmpty: "No credit yet.",
    deleteAccount: "Delete my account",
    deleteAccountHint: "Email us and we remove your data.",
  },

  errors: {
    generic: "Something went wrong. Please try again.",
    capacityFull: "That game just filled up.",
    duplicateActiveBooking: "You already have a spot in this game.",
    creditNegativeBlocked: "Not enough credit for that booking.",
    insufficientPermission: "You are not allowed to do that.",
    cancelWindowClosed: "It is too late to cancel this booking.",
    notSignedIn: "Please sign in first.",
  },

  common: {
    back: "Back",
    close: "Close",
    loading: "Loading…",
    czk: "CZK",
  },
} as const;

export type Strings = typeof strings;
