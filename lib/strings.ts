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
    // Shown only to an is_admin session. Hiding it hides nothing — the gate is
    // `requireAdmin()` in the admin layout — but the panel had no door before.
    admin: "Admin",
  },

  siteFooter: {
    privacy: "Privacy",
    terms: "Terms",
    copyright: "© hrajfotbal",
    // A real address in the footer of every page. A booking product that takes
    // money and holds personal data needs one reachable line that is not a
    // WhatsApp group, and GDPR expects a controller contact anyway.
    contact: "Contact",
    contactEmail: "ahoj@hrajfotbal.com",
  },

  /**
   * The styled 404.
   *
   * A wrong or stale game link is the single most likely way someone lands
   * here — the links travel through WhatsApp, get forwarded, and outlive the
   * game. So the page offers the games list rather than apologising.
   */
  notFound: {
    code: "404",
    title: "Nothing here",
    body: "This link points at a page that does not exist — or a game that has already been and gone.",
    cta: "See what's on →",
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
    loginLede: "Email and password. If you have never set one, use the code below.",
    signInSubmit: "Sign in",
    /*
     * One message for a wrong password and an unknown address, deliberately.
     * Telling them apart tells an attacker which half they got right, and tells
     * a real person nothing they can act on differently.
     */
    invalidCredentials: "That email and password do not match.",
    emailNotConfirmed:
      "Confirm your email first — open the link we sent when you signed up.",

    /*
     * The Phase 1 code path, relabelled. It is no longer the way in; it is the
     * way in for someone who has no password yet, and the recovery route for
     * someone who has forgotten theirs. It is also the rollback if password
     * sign-in ever fails, which is why it stays exactly as it was underneath.
     */
    forgotPasswordLead: "Forgotten your password, or never set one?",
    forgotPasswordCta: "Email me a code",

    setPasswordTitle: "Set a password",
    setPasswordLede:
      "You are signed in. Choose a password and next time you can skip the email entirely.",
    setPasswordSubmit: "Save password",
    setPasswordSkip: "Not now — I'll keep using the code",
    setPasswordFailed: "We could not save that password. Please try again.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    sendLink: "Send link",
    linkSent: "Check your inbox — the link is on its way.",

    // --- the six-digit code ---------------------------------------------------
    // The SAME email carries both a link and a code. The code exists because
    // the link cannot survive every mail client: WhatsApp, Instagram and
    // several Android mail apps open links in an embedded browser with its own
    // cookie jar, and the PKCE verifier written when the link was requested is
    // not in it — so the exchange fails with "code verifier not found" on a
    // link that looks perfectly fine. Typing six digits into the tab that
    // asked for them has no such dependency.
    otpLead: "Or type the 6-digit code from the email:",
    otpLabel: "6-digit code",
    otpPlaceholder: "000000",
    otpSubmit: "Sign in",
    otpInvalid: "That code is not right, or it has expired. Request a new one.",
    otpMalformed: "The code is six digits.",
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

    signupTitle: "Create your account",
    signupLede: "One account, one nickname, and you are in the lineup.",
    /** Shown on the finish-your-profile pass, when the account already exists. */
    signupFinishTitle: "Finish your profile",
    signupFinishLede: "Your email is confirmed. This is the last step.",
    nicknameLabel: "Nickname",
    nicknameHint: "Letters, numbers, spaces, _ and - · up to 20 characters",
    nicknameInvalid:
      "Use only letters, numbers, spaces, _ and - (up to 20 characters).",
    nicknameTaken: "That nickname is taken. Try another.",

    passwordLabel: "Password",
    passwordHint: "At least 8 characters",
    passwordTooShort: "Use at least 8 characters.",

    countryLabel: "Country",
    countryPlaceholder: "Pick your country",
    countryInvalid: "Please pick your country from the list.",

    skillLabel: "How do you play?",
    skillHint: "It shows on your profile. It never stops you booking a game.",
    skillBeginner: "Beginner",
    skillIntermediate: "Intermediate",
    skillAdvanced: "Advanced",
    skillRequired: "Please pick a level.",

    phoneLabel: "Phone (optional)",
    phoneHint: "Only the organizer sees it, and only for games you have booked.",

    /*
     * THREE BOXES, TWO OF THEM LEGAL ACTS.
     *
     * Accepting the terms and consenting to data processing are separate acts
     * with separate errors (contract §3.1, ruled 2026-07-31) — one box covering
     * both makes the consent non-specific, which is what makes it invalid. The
     * reminders preference is grouped apart from them on purpose: a preference
     * that looks like a legal act gets ticked unread, and a legal act that
     * looks like a preference gets ignored.
     */
    legalGroupLabel: "Before you start",
    tosLabel: "I accept the terms of service.",
    tosLink: "Read the terms",
    tosRequired: "Please accept the terms to continue.",
    gdprLabel: "I agree to the privacy policy.",
    gdprLink: "Read the privacy policy",
    gdprRequired: "Please agree to the privacy policy to continue.",
    preferencesGroupLabel: "Optional",
    marketingLabel: "Email me about new games. (Optional)",
    createAccount: "Create my account",

    emailTaken:
      "There is already an account with that email. Sign in instead — or use the code if you have no password yet.",
    signupFailed: "We could not create the account. Please try again.",

    /** The waiting room between `signUp()` and a verified email. */
    verifyTitle: "Confirm your email",
    verifyBody:
      "We sent a link to {email}. Open it and your account is ready — the link works on any device.",
    verifyHint: "No email after a minute or two? Check spam, then try again.",

    signUp: "Sign up",
    haveAccount: "Already have an account?",
    noAccount: "New here?",
  },

  games: {
    listTitle: "Upcoming games",
    /*
     * Empty states.
     *
     * An empty list is the first thing a visitor from a shared link may ever
     * see, so it says what happens next and gives somewhere to go, rather than
     * reporting an absence. `empty` is kept as the one-line form used where
     * there is no room for the full block.
     */
    empty: "No games on the board right now.",
    emptyTitle: "Nothing on the board",
    emptyBody:
      "The next match usually goes up a few days ahead. Join the WhatsApp group and you will hear about it first.",
    emptyCta: "Join the WhatsApp group →",
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
    rosterEmpty: "Nobody in the lineup yet — be the first name on it.",
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

    // --- urgency ladder ------------------------------------------------------
    // Three rungs, and the copy is what distinguishes them: plenty of room
    // reads as an invitation, the last few as a nudge, full as a queue with a
    // way in. `urgencyLabel()` in lib/games/urgency.ts picks the rung — the
    // thresholds are not decided at a render site.
    urgencyOpen: "Spots open",
    urgencyLastFew: "Almost full",
    urgencyFull: "Full",

    // --- the queue, in public ------------------------------------------------
    waitlistTitle: "Waiting list",
    waitlistEmpty: "Nobody is waiting yet — a spot here is still first come.",
    // Marks the viewer's own avatar in the queue. Rendered as a title/aria
    // label, never as visible text inside the avatar.
    waitlistYou: "You",
    waitlistCount: "waiting",
    // Card badge for a logged-in player who holds a waitlist row on that game.
    onWaitlistBadge: "You're waiting",

    // --- your next game ------------------------------------------------------
    nextGameStrip: "Your next game",
    nextGameStripCta: "View booking →",

    // --- share ---------------------------------------------------------------
    shareWhatsApp: "Share on WhatsApp",
    // The message body. {venue}, {when} and {url} are substituted by
    // `whatsAppShareUrl()`; nothing here may be pre-encoded, since that helper
    // encodes the finished string exactly once.
    shareMessage: "{venue} · {when}\nGrab a spot: {url}",
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
    noBookings: "No bookings yet.",
    noBookingsTitle: "Your lineup is empty",
    noBookingsBody: "Claim a spot in any game and it shows up here, with the QR to pay it.",
    findAGame: "Find a game →",
    creditBalance: "Credit balance",
    creditEmpty: "No credit yet.",
    showQr: "Show payment QR",
    creditHint: "Credit is applied automatically to your next booking.",
    photoTitle: "Profile photo",
    photoUpload: "Upload a photo",
    photoReplace: "Replace photo",
    photoHint: "Square crop, up to 2 MB. JPEG, PNG or WebP.",
    photoBadType: "That file type is not supported. Use a JPEG, PNG or WebP.",
    photoTooBig: "That image is over 2 MB. Try a smaller one.",
    photoUploadFailed: "The upload did not work. Please try again.",

    securityTitle: "Sign-in and security",

    changePasswordTitle: "Change password",
    currentPasswordLabel: "Current password",
    newPasswordLabel: "New password",
    changePasswordSubmit: "Change password",
    changePasswordDone: "Password changed.",
    currentPasswordWrong:
      "That is not your current password. If you have never set one, sign out and use the emailed code instead.",

    changeEmailTitle: "Change email",
    newEmailLabel: "New email",
    changeEmailSubmit: "Send confirmations",
    /*
     * Both addresses have to confirm — Supabase's `double_confirm_changes`,
     * kept on deliberately (contract §3.3, ruled 2026-07-28). An email change
     * is an account takeover in one step if the old mailbox has no say, so the
     * UI states the two-confirmation requirement BEFORE the button rather than
     * after it: someone who expects one email and gets two assumes something
     * broke, and someone who expects two knows the change is not done yet.
     */
    changeEmailHint:
      "We send a confirmation to your current address and to the new one. Your email changes only after you confirm both.",
    changeEmailSent:
      "Two confirmations are on their way — one to {current}, one to {next}. Open both.",
    changeEmailSame: "That is already your email.",
    changeEmailFailed: "We could not start the email change. Please try again.",

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

  /**
   * The `/privacy` placeholder.
   *
   * DELIBERATELY NOT A PRIVACY POLICY. A GDPR policy is a legal representation
   * about what this system does with personal data; generated text that reads
   * as finished is worse than an obvious placeholder, because it invites
   * shipping. Everything here is scaffolding around a human-supplied slot —
   * the only strings are the DRAFT warning and the labels of the sections
   * Oliver has to fill in. This copy is replaced wholesale at the M5 cutover,
   * and it is NOT translated: the real policy is a per-language legal text,
   * not a UI string.
   */
  terms: {
    title: "Terms of service",
    versionLabel: "Version",
    /**
     * Shown when the reader's language has no authored document and English is
     * being displayed instead. Never omitted: a person who ticked "I accept the
     * terms" is entitled to know which language the thing they accepted is in.
     */
    notTranslated:
      "These terms have not been translated into your language yet, so the English text is shown. It is the version that applies.",
    back: "← Back to the games",
  },

  /**
   * The six questions, from contract §6. Answers are the contract's own words.
   *
   * Player-facing, so Czech and Russian are required — the Czech is Oliver's,
   * the Russian is a draft awaiting a native reader (see `lib/i18n/ru.ts`).
   */
  faq: {
    title: "Questions",
    items: [
      { q: "When should I show up?", a: "10 minutes before kickoff." },
      {
        q: "What should I bring?",
        a: "Shoes and yourself. Bibs, gloves and balls are provided.",
      },
      {
        q: "How do I pay?",
        a: "Scan the QR from your banking app after booking, or pay cash at the pitch.",
      },
      {
        q: "What if I can't make it?",
        a: "Cancel anytime before kickoff for full wallet credit.",
      },
      {
        q: "What if the game is full?",
        a: "Join the waitlist; we email you the moment a spot opens.",
      },
      {
        q: "Do I need to be good?",
        a: "All levels welcome; games are casual unless a level badge says otherwise.",
      },
    ],
  },

  privacy: {
    title: "Privacy",
    draftBadge: "DRAFT — NOT THE REAL POLICY",
    draftWarning:
      "This page is a placeholder. It is not a privacy policy, it makes no promises, and it must be replaced with the real text before launch.",
    insertionPoint: "▼ HUMAN-SUPPLIED TEXT GOES HERE ▼",
    insertionHint:
      "Oliver supplies the final wording. Nothing below is legally meaningful until then — these are the headings the real text needs to cover, not the text itself.",
    outline: [
      "Who is responsible for your data (controller identity and contact)",
      "What is collected: email, nickname, phone if given, bookings, payments, attendance",
      "Why it is collected and on what legal basis",
      "Who else sees it: the hosting, database and email providers",
      "How long it is kept",
      "Your rights, including access, correction and deletion",
      "How to ask for deletion, and how quickly it happens",
    ],
    contactLead: "Questions or a deletion request, today:",
    back: "← Back to the games",
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

    // --- add shadow player ---------------------------------------------------
    addPlayer: "Add a player",
    addPlayerTitle: "Add a player to this game",
    addPlayerLede:
      "For someone who books over WhatsApp and has never logged in. They get a real identity that can be claimed or merged later.",
    addPlayerNickname: "Nickname",
    addPlayerEmail: "Email (optional)",
    addPlayerEmailHint:
      "With an email, they claim this identity automatically the first time they sign in. Without one, only a merge can link it.",
    addPlayerMethod: "How are they paying?",
    addPlayerSubmit: "Add and book",
    addPlayerDone: "Added and booked",
    // The duplicate-identity guard. A second row for the same person splits
    // their booking history and their wallet, and costs far more to fix later.
    addPlayerDuplicate:
      "A player with that email already exists. Merge instead of creating a second identity.",
    addPlayerGoToMerge: "Open the merge tool →",
    addPlayerNicknameTaken: "That nickname is taken. Try another.",
    addPlayerFull: "This game is full — there is no spot to give.",

    // --- stats ---------------------------------------------------------------
    statsTitle: "Stats",
    statsLede: "Everything below is a query over the event log. Nothing here writes.",
    statFunnel: "Signup → booking → played",
    statFunnelSignups: "Signed up",
    statFunnelBooked: "Booked at least once",
    statFunnelAttended: "Turned up",
    statConversion: "Booking → payment",
    statConversionHint: "Share of bookings ever confirmed as paid.",
    statNoShow: "No-show rate",
    statNoShowHint: "Of the bookings whose attendance has been marked.",
    statCredit: "Credit outstanding",
    statCreditHint: "Money already taken that is still owed in football.",
    statDropOff: "Magic-link drop-off",
    statDropOffHint: "Sign-in links sent versus sign-ins completed.",
    statWaitlist: "Waitlist depth",
    statWaitlistHint:
      "The expansion signal: when this stays deep, add a slot or a venue.",
    statWaitlistEmpty: "No upcoming games with anyone waiting.",
    statOf: "of",

    // --- players, credit grants, merge ---------------------------------------
    playersTitle: "Players",
    playersEmpty: "No players yet.",
    balanceLabel: "Wallet",
    bookingsLabel: "Bookings",
    shadowTag: "Shadow",
    seedTag: "Seed",
    adminTag: "Admin",
    noEmail: "no email",
    grantCredit: "Grant credit",
    grantAmountLabel: "Amount (CZK)",
    grantAmountHint: "Negative to correct a mistake. A wallet can never go below zero.",
    grantNoteLabel: "Why (optional)",
    grantUnmatchedLabel: "This resolves a payment that arrived with a wrong or missing VS",
    grantSubmit: "Add to wallet",
    grantDone: "Wallet updated",
    grantNegativeBlocked: "That would put the wallet below zero.",
    grantInvalid: "Enter an amount other than zero.",

    // --- admin rights --------------------------------------------------------
    // Granting happens in-app as of migration 20. The copy states the one rule
    // that keeps self-elevation impossible, because an admin who does not know
    // why their own row has no button will assume the panel is broken.
    makeAdmin: "Make admin",
    revokeAdmin: "Revoke admin",
    adminSelfNote: "You cannot change your own admin rights.",
    adminConfirmGrant:
      "Give this player the full admin panel — games, payments, players and rights?",
    adminConfirmRevoke: "Take away this player's admin rights?",
    adminChanged: "Admin rights updated",
    adminCannotChangeOwn: "You cannot change your own admin rights.",

    mergeTitle: "Merge a shadow player",
    mergeLink: "Merge identities",
    mergeLede:
      "Moves every booking, waitlist row, credit and event from a shadow onto a real account, then removes the shadow. This cannot be undone.",
    mergeShadowLabel: "Shadow to merge away",
    mergeSurvivingLabel: "Account to keep",
    mergeSubmit: "Merge them",
    mergeDone: "Merged",
    mergeRowsMoved: "Rows moved",
    mergeSelf: "Pick two different players.",
    mergeNotShadow:
      "That player has signed in before, so it cannot be the one merged away. Swap them round.",
    mergeConflict:
      "Both of them hold a spot on the same game. Cancel one of those bookings first.",
    mergePickBoth: "Pick a shadow and an account to keep.",

    // --- attendance + settle -------------------------------------------------
    attendanceTitle: "Attendance",
    attendanceLink: "Attendance & settle",
    attendanceLede: "Mark who turned up, clear anything unpaid, then close the books.",
    markPresent: "Present",
    markNoShow: "No-show",
    attendanceUnmarked: "Not marked",
    markPlayed: "Mark as played",
    settleGame: "Settle the game",
    settled: "Settled",
    // The hard block: an unpaid hold surviving into `settled` is a debt with
    // no surface left to raise it.
    settleBlocked: "Settle is blocked — these bookings are still unpaid:",
    settleBlockedHint:
      "Take payment (✓ Paid on the game page) or cancel the booking, then settle.",
    settleNeedsPlayed: "Mark the game as played first.",

    // --- reconciliation ------------------------------------------------------
    paymentsTitle: "Awaiting payment",
    paymentsEmpty: "Nothing outstanding — every spot on this game is settled up.",
    rosterTitle: "Roster",
    rosterEmpty: "Nobody has claimed a spot yet.",
    vsLabel: "VS",
    amountDueLabel: "Due",
    markPaid: "✓ Paid",
    amountDiffers: "Amount differs",
    receivedLabel: "Received (CZK)",
    confirmReceived: "Confirm this amount",
    paymentConfirmed: "Payment confirmed",
    // Overpayment: the surplus becomes wallet credit. Money never leaves.
    creditIssuedNotice: "Credit issued to the player's wallet:",
    // Underpayment: the RPC refuses and the booking stays reserved.
    underpaidNotice: "Short by",
    underpaidHint: "The booking is still held and unpaid — follow up with the player.",
    // Payment landing after expiry: credited in full, spot NOT reinstated.
    expiredCreditedNotice:
      "That booking had already expired. The amount went to the player's wallet as credit — the spot was not given back.",
    badge: {
      paid: "Paid",
      reserved: "Holding",
      cash: "Cash",
      seed: "Free",
      credit: "Credit",
      cancelled: "Cancelled",
      expired: "Expired",
    },

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
