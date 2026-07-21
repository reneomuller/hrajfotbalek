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
    games: "Games",
    logIn: "Log in",
    profile: "My profile",
    home: "Hraj Fotbal — home",
  },

  ticker: {
    live: "LIVE",
    upcoming: "UPCOMING",
  },

  siteFooter: {
    privacy: "Privacy",
    copyright: "© hrajfotbal",
  },

  landing: {
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
    nextMatchCta: "Claim your spot",


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
    sendLink: "Send link",
    linkSent: "Check your inbox — the link is on its way.",
    linkExpired: "That link has expired. Request a new one.",
    signOut: "Sign out",
    emailInvalid: "That does not look like an email address.",
    linkSendFailed: "We could not send the link. Please try again.",
    callbackFailed: "That sign-in link is invalid or has already been used.",
    callbackErrorTitle: "Sign-in link did not work",
    callbackRetry: "Request a new link",
    // Shown alongside the friendly copy. A failed exchange has several causes
    // that look identical to the user but need different fixes, so the
    // underlying reason is surfaced rather than swallowed.
    callbackDetailLabel: "Technical detail",

    signupTitle: "Choose your nickname",
    signupLede: "This is the name that appears in the lineup.",
    nicknameLabel: "Nickname",
    nicknameHint: "Letters, numbers, spaces, _ and - · up to 20 characters",
    nicknameInvalid:
      "Use only letters, numbers, spaces, _ and - (up to 20 characters).",
    nicknameTaken: "That nickname is taken. Try another.",
    gdprLabel: "I agree to the privacy policy.",
    gdprLink: "Read the privacy policy",
    gdprRequired: "Please agree to the privacy policy to continue.",
    marketingLabel: "Email me about new games. (Optional)",
    createAccount: "Create my account",
  },

  games: {
    listTitle: "Upcoming games",
    empty: "No games scheduled yet. Check back soon.",
    spotsLeft: "spots left",
    spotLeft: "spot left",
    full: "Full",
    joinWaitlist: "Join the waitlist",
    // Shown instead of a CTA on a full game. It deliberately promises nothing:
    // the waitlist RPC does not exist until Phase 17, so any "you are on the
    // list" copy here would be a claim with no row behind it.
    fullNotice: "This game is full — every spot is taken.",
    seeOtherGames: "See other games →",
    onWaitlist: "You are on the waitlist",
    rosterTitle: "Lineup",
    rosterEmpty: "No one has claimed a spot yet.",
    cancelled: "This game was cancelled.",
    notFound: "That game does not exist, or is not published yet.",
    backToGames: "← All games",
    viewGame: "View game",
    // Roster badges. The view projects booking status only — `reserved` means
    // a spot is held but unpaid, `confirmed` means paid or covered by credit.
    rosterReserved: "holding",
    rosterConfirmed: "in",
    // Landing next-match block, per the design reference.
    filledLabel: "FILLED",
    joinNote: "One tap to claim. Pay ahead from your phone.",
    openMap: "OPEN MAP ↗",
    mapAlt: "Map of the venue",
    // Shown on an avatar whose nickname has no letters or digits at all.
    rosterUnknown: "?",
    capacityLabel: "Capacity",
    startsLabel: "Kick-off",
    venueLabel: "Where",
    priceLabel: "Price",
    alreadyStarted: "This game has already kicked off.",
  },

  booking: {
    claimSpot: "Claim your spot",
    logInToClaim: "Log in to claim",
    nicknameLabel: "Nickname",
    nicknameHint: "Letters, numbers, spaces, _ and - · up to 20 characters",
    payByQr: "Pay by QR",
    payByQrHint: "Scan a code in your banking app. Your spot is held until you pay.",
    payByCash: "Pay cash on the pitch",
    payByCashHint: "Bring cash. The organizer confirms you on the day.",
    choosePayment: "How do you want to pay?",
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
    // Full-credit and seed outcomes: confirmed instantly, nothing to pay.
    coveredByCredit: "Your credit covered this game in full. Nothing to pay.",
    coveredBySeed: "You are in. Nothing to pay for this one.",
    backToGame: "← Back to the game",
    bookingNotFound: "We could not find that booking.",
  },

  payment: {
    qrTitle: "Scan to pay",
    qrHint: "Open your banking app and scan. The payment identifies itself.",
    account: "Account",
    variableSymbol: "Variable symbol",
    amount: "Amount",
    paidAlready: "I have paid",
    pendingConfirmation: "Waiting for the organizer to confirm your payment.",
  },

  account: {
    title: "My account",
    myBookings: "My bookings",
    noBookings: "You have no bookings yet.",
    findAGame: "Find a game →",
    creditBalance: "Credit balance",
    creditEmpty: "No credit yet.",
    showQr: "Show payment QR",
    creditHint: "Credit is applied automatically to your next booking.",
    deleteAccount: "Delete my account",
    deleteAccountHint: "Email us and we remove your data.",
    deleteMailto: "privacy@hrajfotbal.com",
    deleteSubject: "Account deletion request",
    // Payment/status badges.
    badgePaid: "Paid",
    badgeReserved: "Awaiting payment",
    badgeCash: "Cash on the pitch",
    badgeSeed: "Free",
    badgeCancelled: "Cancelled",
    badgeExpired: "Expired",
    past: "Past",
    upcoming: "Upcoming",
    cancelSuccess: "Booking cancelled. Any credit is back in your wallet.",
  },

  errors: {
    generic: "Something went wrong. Please try again.",
    // Losing a capacity race is a normal outcome here, not an exception — the
    // copy says what happened and what is still true, rather than apologising.
    capacityFull: "That spot was taken while you were deciding.",
    capacityFullTitle: "Spot already taken",
    duplicateActiveBooking: "You already have a spot in this game.",
    duplicateActiveBookingTitle: "Already booked",
    creditNegativeBlocked: "Not enough credit for that booking.",
    insufficientPermission: "You are not allowed to do that.",
    cancelWindowClosed: "It is too late to cancel this booking.",
    notSignedIn: "Please sign in first.",
    gameNotBookable: "This game is not open for booking.",
    gameAlreadyStarted: "This game has already kicked off.",
    tryAgain: "Try again",
  },

  common: {
    back: "Back",
    close: "Close",
    loading: "Loading…",
    czk: "CZK",
  },
} as const;

export type Strings = typeof strings;
