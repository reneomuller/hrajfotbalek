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
    waitlistJoined: "You are on the waitlist. We will email you when a spot opens.",
    waitlistAlready: "You are already on the waitlist for this game.",
    waitlistHint:
      "Everyone waiting is told at the same moment a spot opens — first to claim it gets it.",
    // Position on the list. {position} is substituted by `waitlistPositionLabel`.
    // It sits next to `waitlistHint`, which is what keeps it honest: under
    // notify-all FCFS the number says how many joined ahead, not who is served
    // first. Never render one without the other.
    waitlistPosition: "You're #{position} in line",
    waitlistConvertTitle: "Claim the open spot",
    waitlistConvertHint: "Pick how you want to pay and the spot is yours.",
    waitlistNotOnList: "You are not on the waitlist for this game.",
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
    // Surface labels, keyed by the `games_surface_known` values. A closed set
    // in the database gets a closed set of copy here rather than a raw value
    // being rendered.
    surface: {
      turf: "Turf",
      grass: "Grass",
      indoor: "Indoor",
      sand: "Sand",
    },
    notesLabel: "Good to know",
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
    // Cancellation reassurance, shown before the player commits. The window is
    // never written as a literal: `cancellationReassurance()` picks the kickoff
    // wording under policy v1 (`cutoffHoursBeforeStart: 0`) and interpolates
    // {hours} into the cutoff wording if a v2 policy introduces a lead time.
    cancelReassuranceKickoff:
      "Cancel anytime before kickoff for full wallet credit.",
    cancelReassuranceCutoff:
      "Cancel up to {hours}h before kickoff for full wallet credit.",
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

  admin: {
    // --- shell ---------------------------------------------------------------
    title: "Admin",
    navGames: "Games",
    navPlayers: "Players",
    navStats: "Stats",
    backToSite: "← Back to the site",

    // --- games list ----------------------------------------------------------
    gamesTitle: "Games",
    gamesEmpty: "No games yet. Create the first one.",
    newGame: "New game",
    editGame: "Edit",
    manageGame: "Manage",
    publishGame: "Publish",
    publishedDone: "Published",
    statusLabel: "Status",
    bookedLabel: "Booked",
    waitlistLabel: "Waiting",
    // Statuses are rendered from this table rather than the raw enum: the
    // column is a database value, not user-facing copy.
    status: {
      draft: "Draft",
      published: "Published",
      full: "Full",
      played: "Played",
      settled: "Settled",
      cancelled: "Cancelled",
    },

    // --- game form -----------------------------------------------------------
    newGameTitle: "New game",
    editGameTitle: "Edit game",
    venueLabel: "Venue",
    venueNew: "Add a new venue",
    venueNameLabel: "Venue name",
    venueImageLabel: "Image file",
    venueImageHint:
      "A file already committed under public/venues/ — e.g. prazacka.jpg. Leave empty for no photo.",
    venueMapQueryLabel: "Map search (optional)",
    venueMapQueryHint: "What to search for in Google Maps. Defaults to the venue name.",
    startsAtLabel: "Kick-off",
    capacityLabel: "Capacity",
    capacityHint: "Cannot be lowered below the players already booked.",
    priceLabel: "Price (CZK)",
    priceHint: "Applies to future bookings only — existing bookings keep their price.",
    formatLabel: "Format (optional)",
    formatHint: "Like 6v6. Leave empty if it varies.",
    surfaceLabel: "Surface (optional)",
    surfaceNone: "Not specified",
    surfaceOptions: {
      turf: "Turf",
      grass: "Grass",
      indoor: "Indoor",
      sand: "Sand",
    },
    notesLabel: "Notes (optional)",
    notesHint: "Logistics for players — gate codes, parking, what to bring.",
    createGame: "Create as draft",
    createGameHint: "A new game is a draft. Publishing it is a separate step.",
    saveGame: "Save changes",
    saved: "Saved",
    draftNotPublic: "This game is a draft — it is not on the public games list.",

    // --- errors --------------------------------------------------------------
    venueRequired: "Pick a venue, or add a new one.",
    venueNameRequired: "Give the new venue a name.",
    venueExists: "A venue with that name already exists — pick it from the list.",
    venueImageInvalid:
      "That does not look like a file under public/venues/ (letters, numbers, . _ - and a png/jpg/webp/avif extension).",
    startsAtRequired: "Set a kick-off time.",
    capacityInvalid: "Capacity must be a whole number of at least 1.",
    capacityBelowBooked:
      "Capacity cannot go below the players already booked. Cancel a booking first.",
    priceInvalid: "Price must be 0 or more.",
    formatInvalid: "Format looks like 6v6 — two numbers with a v between them.",
    notesTooLong: "Notes are limited to 500 characters.",
    invalidTransition: "That is not possible in this game's current state.",

    cancelGame: "Cancel this game",
    cancelGameWarning:
      "This cancels every booking, returns every player's money as credit, clears the waitlist and emails everyone. It cannot be undone.",
    cancelGameConfirm: "Yes — cancel the game",
    cancelGameDone: "Game cancelled",
    cancelledBookings: "Bookings cancelled",
    creditsIssued: "Players credited",
    waitlistCleared: "Waitlist rows cleared",
    noticesSent: "Notices sent",
    receiptsSent: "Credit receipts sent",
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
    gameNotWaitlistable: "This game is not taking waitlist joins.",
    // True only in the waitlist flow: the row survives a lost race.
    capacityFullWaitlist:
      "That spot went to someone else. You are still on the waitlist for the next one.",
    gameNotBookable: "This game is not open for booking.",
    gameAlreadyStarted: "This game has already kicked off.",
    tryAgain: "Try again",
  },

  /**
   * Transactional email copy.
   *
   * EIGHT in-app templates live here. The ninth transactional email in the
   * spec — the magic link — is delivered by Supabase's own mailer and has
   * deliberately NO entry in this table and no template in the codebase.
   *
   * Window figures (12h / 24h) are never written as literals here: the
   * templates interpolate them from lib/policy.ts so a v2 policy bump moves
   * the copy with it.
   */
  emails: {
    common: {
      when: "When",
      where: "Where",
      amountDue: "Amount due",
      variableSymbol: "Variable symbol",
      account: "Account",
      credit: "Credit",
      viewGame: "View the game",
      viewAccount: "Open my account",
      findAnother: "Find another game",
      signOff: "See you on the pitch.",
    },

    spotHeld: {
      subject: "Spot held — pay with this QR",
      heading: "Your spot is held",
      body:
        "Scan the QR in your banking app, or pay by hand using the details below. " +
        "Your spot is held until the payment lands.",
      spdLabel: "Payment string (SPD)",
    },

    paymentConfirmed: {
      subject: "Payment confirmed — you are in",
      heading: "Payment confirmed",
      body: "You are in the lineup. The calendar invite is attached.",
    },

    nudge: {
      subject: "Pay now or lose your spot",
      heading: "Someone is waiting for your spot",
      // {hours} is interpolated from lib/policy.ts, never hardcoded.
      body:
        "This game is full and players are on the waitlist. Pay online within " +
        "{hours}h or the spot goes to the next player.",
    },

    expiry: {
      subject: "Your unpaid spot has expired",
      heading: "Spot released",
      body:
        "The reservation went unpaid, so the spot has been released to the " +
        "waitlist. You can still grab another game.",
    },

    reminder: {
      subject: "See you tomorrow",
      heading: "Your game is coming up",
      // {hours} is interpolated from lib/policy.ts, never hardcoded.
      body: "Kick-off is within {hours}h. Here are the details again.",
    },

    waitlistSpotOpen: {
      subject: "A spot just opened",
      heading: "A spot just opened",
      body:
        "A spot has come free and everyone on the waitlist has been told at the " +
        "same time — first to claim it gets it.",
      cta: "Claim the spot",
    },

    cancellationCredit: {
      subject: "Booking cancelled — credit added",
      heading: "Booking cancelled",
      body:
        "Your booking is cancelled and what you paid is back in your wallet as " +
        "credit. It applies automatically to your next booking.",
      noCreditBody:
        "Your booking is cancelled. Nothing had been paid, so there is no " +
        "credit to return.",
    },

    gameCancelled: {
      subject: "Game cancelled",
      heading: "This game is off",
      body:
        "The organizer cancelled this game. Anything you had paid is back in " +
        "your wallet as credit and applies automatically to your next booking.",
      noCreditBody:
        "The organizer cancelled this game. Nothing had been paid, so there is " +
        "no credit to return.",
    },
  },

  common: {
    back: "Back",
    close: "Close",
    loading: "Loading…",
    czk: "CZK",
  },
} as const;

export type Strings = typeof strings;
