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
    // "Sign in" rather than "Log in": it is the verb the rest of the auth
    // copy already uses ("Sign in", "Sign out"), and the header was the one
    // place saying something different.
    logIn: "Sign in",
    profile: "My profile",
    /*
     * The bottom tab bar's four labels (v1.2 §7). Short because they sit under
     * a 22px icon in a quarter of a phone's width — "My profile" wraps there
     * and a wrapped tab label is what makes a tab bar look homemade.
     */
    homeShort: "Home",
    pass: "Pass",
    myGames: "My games",
    profileShort: "Profile",
    /** The accessible name of the tab bar itself. */
    primary: "Main navigation",
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
    /*
     * THE FALLBACK, not the source of truth (round 13, item 18). The addresses
     * and numbers the dialog shows live in `site_settings` and are edited in
     * `/admin`; this is what renders when the owner has not set any, so a
     * fresh database still has one reachable line rather than an empty box.
     */
    contactEmail: "ahoj@hrajfotbal.com",
    contactTitle: "Get in touch",
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
    /*
     * THE HERO HEADLINE IS THE SLOGAN, IN TWO LINES (redesign v2, round 3).
     *
     * It was the WORDMARK — `headlineLead` + `headlineAccent`, "HRAJ FOTBAL."
     * set at hero scale — with the slogan under it as an italic sub-line.
     * `p01` draws the slogan itself as the hero, in two Anton rows, and no
     * wordmark: the header already carries the mark eighty pixels above, so
     * the old hero spent its largest type saying the brand name twice and its
     * second-largest saying the only thing a first-time visitor needs.
     *
     * Both keys are removed rather than left unused, along with their
     * `INTENTIONALLY_UNTRANSLATED` exemptions — a dead string is a render
     * site nobody knows about.
     *
     * `heroSub` SPLITS AT THE FIRST SENTENCE, which is where all three
     * languages break: the verb phrase, then the two adverbs. The period
     * after line one is drawn by the component in volt, so it is not in the
     * string — a trailing "." here would render twice.
     *
     * The source is `home.heroTagline` from the v1.3 copy table (§4), not a
     * fresh draft: the Czech and Russian there are the reviewed pair for this
     * exact line.
     */
    /*
     * ~~REMOVED IN ROUND 12 (item 2b): the hero's first line is `HRAJ FOTBAL.`
     * in every language and renders from `brand`, which the overlays are
     * forbidden to touch.~~
     *
     * RESTORED IN ROUND 13 (item 2) — the owner reversed it. The hero is the
     * SLOGAN again and the slogan translates: a Czech reader arriving on a
     * Czech site should be told what the site is FOR in Czech, and the brand
     * name is already the roundel eighty pixels above.
     *
     * TWO KEYS, NOT A `<br>`, and that part never changed: line one is the
     * verb phrase and line two the two adverbs, which is where all three
     * languages break. A width-driven break would move it off the sentence.
     */
    heroLine1: "Play football",
    heroLine2: "Anytime. Anywhere.",
    vision:
      "One match that repeats itself. Find a game, claim your spot, show up.",
    heroCta: "Find a game →",
    scrollHint: "↓ SCROLL",
    steps: [
      {
        index: "01",
        title: "Find a game",
        body: "Matches near you, every week.",
      },
      {
        index: "02",
        title: "Claim your spot",
        body: "Secure your spot by paying a fee. We do the rest.",
      },
      {
        index: "03",
        title: "Come and play",
        body: "Show up at the pitch and enjoy the game",
      },
    ],
    nextMatchEyebrow: "//",
    // --- stats strip (§6, REQ-HOME-002) ------------------------------------
    // Two numbers under the wordmark. Games-per-week is COMPUTED from published
    // games in the trailing seven days; active players is admin-editable and
    // honestly framed — it counts the community including the WhatsApp cohort,
    // not the number of rows in `players`.
    // Both numbers are admin-editable claims (§6, v1.2) — the "+" is rendered
    // by the panel, so these are the captions under the figure and not the
    // sentence. "7+ / games every week" reads as one line on the card.
    statsGamesLabel: "Games every week",
    statsPlayersLabel: "Active players",
    // Was "NEXT MATCH", one card. Three rows now — see the section comment in
    // app/page.tsx: one card could only ever answer "is there a game", and the
    // question a visitor arrives with is "is there a game I can make".
    nextMatchesLabel: "Upcoming matches",
    nextMatchesAll: "All games →",
    potmTitle: "Player of the month",
    potmEmpty: "Nobody picked yet — could be you.",
    /*
     * Hours on the pitch this month, from ATTENDED games — the stat that
     * turns a pick into a reason. `{hours}` is already rounded to one decimal
     * by `pitchHours`; the string does no arithmetic.
     */
    potmHours: "{hours} h on the pitch this month",


    community: {
      title: "Join our community",
      body: "Follow our socials to keep up to date with the latest community news",
      whatsapp: "WhatsApp",
      whatsappUrl: "https://chat.whatsapp.com/LjPjGf3rf32CNifizwzsW9?mode=gi_t",
      /*
       * ~~"@HRAJFOTBAL"~~ — the PLATFORM name, since round 13 (item 19). With
       * a third tile the handle no longer fits a third of the row, and it was
       * the only tile naming an account where its neighbours named an app.
       * The handle is the destination.
       */
      instagram: "Instagram",
      instagramUrl: "https://instagram.com/hrajfotbal",
      /*
       * TELEGRAM (round 13, item 19). A product's name is not a word, so both
       * keys join WhatsApp's and Instagram's in the intentionally-untranslated
       * set rather than being written out three times identically.
       */
      telegram: "Telegram",
      telegramUrl: "https://t.me/+yXnyRFfxCGkyYWJi",
    },

    footer: {
      wordmarkLead: "HRAJ",
      wordmarkAccent: "FOTBAL",
      city: "· PRAGUE",
    },
  },

  auth: {
    loginTitle: "Sign in",
    /*
     * "below" WAS TRUE UNTIL ROUND 9, ITEM 8. The code form sat permanently
     * open under this one; it is behind a link now, so the sentence had to
     * stop pointing down the page.
     */
    loginLede: "Email and password. No password yet? Use the reset link.",
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
    /* --- reset (round 9, item 8) --- */
    forgotPasswordLink: "Forgot your password?",
    resetTitle: "Reset your password",
    resetLede:
      "We email you a six-digit code. Enter it here and you can set a new password.",
    resetBackToLogin: "← Back to sign in",
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

    /*
     * REQUIRED SINCE ROUND 7, item 7. The label loses "(optional)" — a field
     * whose label says optional and whose validator says otherwise is the
     * worst of both, and it is the label people read, not the asterisk.
     */
    phoneLabel: "Phone",
    phoneHint: "Only the organizer sees it, and only for games you have booked.",
    phoneRequired: "We need a phone number so the organizer can reach you about a game.",
    phoneInvalid: "A phone number is between 3 and 32 characters.",

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
    // The header carries ONE door as of v1.1.4 (§3.1a), so the create-account
    // path lives here — which is where someone with no account is already
    // looking. Removing it from the header without this line would leave
    // /signup reachable only by typing the URL.
    noAccountLead: "Not a member yet?",
    createAccountCta: "Sign up →",
    haveAccount: "Already have an account?",
    /*
     * GOOGLE (round 7, item 1). Rendered only when `NEXT_PUBLIC_GOOGLE_AUTH`
     * is set — see `components/auth/GoogleAuthButton.tsx` — so these keys
     * exist before the control does.
     *
     * "Google" is the company's name and is not translated in any of the
     * three; the verb around it is.
     */
    googleContinue: "Continue with Google",
    googleSignUp: "Sign up with Google",
    googleFailed: "We could not start the Google sign-in. Please try again.",
    /* The divider between the Google button and the email form (p08, p09). */
    authOr: "or",
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
    // v1.3 §4. Shorter than what it replaces, and the arrow is gone from the
    // CTA because the CTA is a button now (§2.9) — an arrow on a button is an
    // affordance drawn twice.
    emptyTitle: "No games scheduled",
    emptyBody: "New games go up every week.",
    emptyCta: "Join the WhatsApp group",
    spotsLeft: "spots left",
    spotLeft: "spot left",
    full: "Full",
    /*
     * The canonical card's duration (v1.3 §2.1) — `60 min` beside the
     * kick-off, at `small`/muted.
     *
     * ABBREVIATED IN EVERY LANGUAGE, deliberately. §2.13 lists the duration
     * among the four things on the card that never truncate, so it has to fit
     * beside a 28px kick-off and a format pill at 390px in Czech — and "minut"
     * spelled out does not. The abbreviation is the same one a Czech or
     * Russian sports app uses, so nothing is lost by it.
     */
    durationMin: "{n} min",
    /** The `past` state on My Games' finished games (v1.3 §2.1 states table). */
    past: "Finished",
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
    /*
     * §3 SCREEN 8's THREE DRAWN STATES.
     *
     * The machinery for all three existed; what did not was a drawn state, so
     * each rendered as a grey sentence in a box — the §2.9 failure ("never a
     * bare centred sentence") on the one flow where a player is waiting for
     * something and most needs to know where they stand.
     */
    waitlistJoinedTitle: "You're on the list",
    waitlistSpotOpenTitle: "A spot just opened",
    waitlistSpotOpenBody:
      "Everyone waiting was told at the same moment. Claim it and it's yours.",
    waitlistNotOnListTitle: "You're not on this waitlist",
    waitlistNotOnListBody:
      "Someone may have taken the spot already, or you joined a different game.",
    waitlistSeeGame: "See the game",
    rosterTitle: "Lineup",
    rosterEmpty: "Nobody has claimed a spot yet",
    cancelled: "This game was cancelled.",
    notFound: "That game does not exist, or is not published yet.",
    backToGames: "← All games",
    viewGame: "View game",
    // Copy link is the PRIMARY share (§5.4): a copied link goes wherever the
    // sender is already talking, and WhatsApp is one of those places rather
    // than all of them.
    copyLink: "Copy link",
    copyLinkFailed: "Could not copy — long-press the address bar instead.",
    // The day-picker strip (§5.5). "Today" and "Tomorrow" earn their special
    // case: they are the two days anyone opening this page is deciding
    // between, and "Sun" on a Sunday makes a reader do arithmetic.
    dayFilterAll: "All",
    dayToday: "Today",
    dayTomorrow: "Tomorrow",
    /*
     * THE CALENDAR CELL'S ABBREVIATION, English only.
     *
     * All eight cells must stay visible at 390px (owner ruling) — a calendar
     * that scrolls hides days, which is the failure the eight-box strip was
     * reversed for. `Tomorrow` is the one label that cannot fit a cell narrow
     * enough for eight; Czech `Zítra` and Russian `Завтра` fit, so they keep
     * their whole word and this key is only overridden where it is needed.
     *
     * The PILLS and the day-group HEADINGS keep the full word — they have a
     * line to themselves, and an abbreviation there would be a cost with no
     * benefit.
     */
    dayTomorrowShort: "Tmrw",
    // Roster badges. The view projects booking status only — `reserved` means
    // a spot is held but unpaid, `confirmed` means paid or covered by credit.
    rosterReserved: "holding",
    rosterConfirmed: "in",
    // Landing next-match block, per the design reference.
    filledLabel: "FILLED",
    joinNote: "One tap to claim. Pay ahead from your phone.",
    openMap: "OPEN MAP ↗",
    // The full-width version on the rebuilt detail page. The short one is a
    // chip over a photograph where space is the constraint; this one is a
    // 44px-tall row where the constraint is that someone standing outside the
    // pitch in the dark can hit it.
    openMapFull: "Open location in Maps",
    mapAlt: "Map of the venue",
    // The panel is a real photograph of the pitch now, not a traced map, so
    // the alt text names the venue rather than describing a diagram.
    venuePhotoAlt: "The pitch at {venue}",
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
    // "2 subs per team" — renders beside the format when the organizer set it,
    // and nothing at all when they did not (§5.3a). It describes how the game
    // is run; it constrains no booking.
    subsPerTeam: "{count} subs per team",
    // Level badges. Rendered ONLY on a restricted game — an all-levels game
    // carries no badge anywhere, which is what makes a badge mean something.
    skillLevel: {
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
    },
    // Said plainly beside the badges, because a badge alone reads as a door
    // policy. Skill is a signal here and never a gate — `create_booking` does
    // not consult it.
    skillNotEnforced: "All welcome — this is a guide, not a rule.",

    // --- organizer -----------------------------------------------------------
    organizerLabel: "Organizer",
    // Shown under the name when there is no phone to show — a card with a face
    // and a name and then nothing reads as something that failed to load.
    organizerRole: "Runs this game",
    organizerWhatsApp: "Message on WhatsApp",
    /*
     * The prefilled message body (round 8, item 8). `{game}` is the venue and
     * kick-off, so an organizer running four fixtures a week does not have to
     * ask which one.
     */
    organizerWhatsAppMessage: "Hi! A question about {game}.",
    // Shown to a player holding a spot, and to nobody else. The line says so,
    // so the number does not look like something that leaked.

    // --- your booking (§5.6) -------------------------------------------------
    yourBookingTitle: "You are in",
    yourBookingHeld: "Your spot is held — pay to confirm it.",
    yourBookingConfirmed: "Paid. See you on the pitch.",
    yourBookingCash: "Paying cash at the pitch.",
    yourBookingPay: "Pay for this spot",
    yourBookingManage: "Manage your booking",

    // --- practical info (§5.7) -----------------------------------------------
    // --- availability / lineup (v1.2 §5.6) ----------------------------------
    /*
     * `Join →` ON A LIST CARD — PAINT, NOT A CONTROL (redesign v2, R1).
     *
     * The frames draw a button here. It ships as a button-STYLED span with no
     * href, no handler and no focus stop: ruling E is upheld and the whole card
     * remains the single anchor. The string exists because the words are still
     * user-visible and still need three languages.
     */
    cardJoinCue: "Join",

    availabilityLabel: "Availability",
    // The supporting detail under the bar. Was "07/12" in 22px mono, which is
    // two numbers the reader has to subtract before it means anything.
    playersOfCapacity: "{booked} / {capacity} players",
    playersTitle: "Players ({count})",
    /*
     * GUESTS (round 11). Two patterns, because two kinds of guest exist and
     * they know different amounts about themselves.
     *
     * `guestOfPlayer` takes the owner's FIRST name and a 1-based index. The
     * possessive is inside the pattern rather than built from it: English
     * forms one with an apostrophe, Czech and Russian do not form one this way
     * at all, and a template that concatenated "'s" would be untranslatable.
     *
     * `guestNumbered` is a house guest — a seat an admin is holding for
     * somebody with no account. It has an index and nothing else.
     */
    guestOfPlayer: "{name}'s Guest {n}",
    guestNumbered: "Guest {n}",
    /** Screen-reader wording for the silhouette an anonymous guest carries. */
    guestAvatarLabel: "Guest",
    /*
     * How many games this player has actually PLAYED — settled or played
     * games, never bookings. A counter that rose when you booked would be
     * measuring intent.
     *
     * THREE FORMS, and the third is the one that matters. "0 games" beside
     * someone standing in their first lineup reads as a verdict on them; "First
     * game" reads as a welcome, and it is the same fact. The singular exists
     * because "1 games" is the kind of thing a reader notices and nothing else
     * on the page recovers from.
     */
    gamesPlayed: "{count} games",
    gamePlayedOne: "1 game",
    gamesPlayedNone: "First game",

    // --- what's included (v1.2 §5.7) ----------------------------------------
    /*
     * The game-information card's heading (round 13, item 14). It sits
     * directly above `includedTitle` and takes the same treatment, which is
     * the point: three sections down the page, all named the same way.
     */
    gameInfoTitle: "Game information",
    includedTitle: "What's included",
    /*
     * THE SECOND HEADING (Section 4, item 2). The column is one flat `text[]`;
     * the split between the two groups is the app-side catalog's, recovered
     * from the grouping this repo already documented in
     * `lib/venues/amenities.ts` and migration 20260802210000 rather than
     * invented here.
     */
    pitchAmenitiesTitle: "Pitch amenities",
    /*
     * The amenity catalog, in the same order `lib/venues/amenities.ts` renders
     * it. Every key here has a matching value in `venues_amenities_catalog`
     * (migration 38) and an icon in `components/Icon.tsx` — three places, one
     * list, and widening any of them means widening all three.
     */
    amenities: {
      bibs: "Bibs provided",
      gloves: "Goalkeeper gloves",
      balls: "Match balls",
      water: "Water",
      drinks: "Drinks",
      showers: "Showers",
      lockers: "Lockers",
      parking: "Parking",
      wifi: "WiFi",
      first_aid: "First aid",
    },

    practicalTitle: "Game information",
    /*
     * GOOD TO KNOW's five lines (Section 4, item 7). Duration and arrival
     * existed; the rotations are new, and the meeting point is a per-game
     * field whose line is hidden when empty.
     */
    practicalRotatingKeepers: "Rotating goalkeepers",
    practicalRotatingSubs: "Rotating subs",
    practicalMeetingPoint: "Meeting point",
    practicalArrival: "Arrive 10 minutes before the game",
    practicalDuration: "Duration",
    practicalDurationValue: "{minutes} minutes",

    notesLabel: "Game information",
    capacityLabel: "Capacity",
    startsLabel: "Kick-off",
    venueLabel: "Where",
    priceLabel: "Price",
    alreadyStarted: "This game has already kicked off.",
    // Distinct from `alreadyStarted`, and the distinction is the point: while
    // the ball is rolling the page says so, and only once the game has run its
    // duration does it become past tense.
    inProgress: "This game is being played right now.",

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
    /*
     * The claim bar's seven states (v1.3 §2.4). Every one of these is a LABEL
     * ON A BAR THAT IS ALWAYS PRESENT — the states that carry no button carry
     * a sentence instead, because an empty bar is the bug ruling G is fixing.
     */
    signInToClaim: "Sign in to claim",
    barPaid: "Paid",
    // {amount} is a formatted CZK figure — `formatCzk`, never interpolated by
    // hand, because it is the one number here a player checks against a bank.
    barAmountDue: "{amount} due",
    barKickedOffAt: "Kicked off {time}",
    barCancelled: "Cancelled",
    barOnWaitlist: "You are #{n} on the waitlist",
    // When `waitlist_position` comes back null. Saying nothing about the
    // number beats falling back to `Join waitlist`, which invites a second
    // join for a place the player already holds.
    barOnWaitlistNoPosition: "You are on the waitlist",
    barCancel: "Cancel",
    /** The bar is a landmark region and needs a name of its own (§2.4). */
    barLabel: "Your spot on this game",
    nicknameLabel: "Nickname",
    nicknameHint: "Letters, numbers, spaces, _ and - · up to 20 characters",
    /*
     * THE TWO OPTIONS (round 7, item 10, and ruling R3).
     *
     * `payByQr` is retired FROM THE UI and kept as a key: the QR rail is the
     * substrate the online option books onto and R3 forbids touching it. The
     * confirmation screen and the top-up flow still render it.
     */
    payByQr: "Pay by QR",
    payByQrHint: "Scan a code in your banking app. Your spot is held until you pay.",
    /* --- Redeem credit (round 8, item 11) --- */
    payWithCredit: "Redeem credit",
    /*
     * `{seats}` IS THE WHOLE PARTY (round 11). One credit is one game for one
     * person, so a party of three spends three — and the option is offered
     * only when the wallet holds all of them.
     */
    payWithCreditHint: "Uses {seats} credit(s) from your wallet. Nothing to pay.",
    payWithCreditNone: "You have no credits yet.",
    addCredits: "Add credits →",
    payOnline: "Online payment",
    payOnlineHint: "Paid securely with Stripe",
    payOnlineComingSoon: "Coming soon",
    payByCash: "Pay cash on the pitch",
    payByCashHint: "Bring cash. The organizer confirms you on the day.",
    choosePayment: "How do you want to pay?",
    /* --- bringing people (round 11, part B) --- */
    partyTitle: "Bringing anyone?",
    partyHint: "They play as your guests. One booking, one payment, one cancellation.",
    /** The "just me" choice. Always available; always the default. */
    partyJustMe: "Just me",
    /** `+1`, `+2`, `+3`. The plus is part of the label, as the control reads. */
    partyPlus: "+{n}",
    /** Under the group, once a party is chosen. */
    partySummary: "{seats} spots · {total}",
    /**
     * Shown when the pitch has less room than the ceiling allows, so the
     * missing buttons are explained rather than simply absent.
     */
    partyLimited: "Only {n} more can fit on this pitch.",
    /**
     * THE ONE THING A STATIC PAYMENT LINK CANNOT DO. A Stripe Payment Link
     * carries a fixed quantity of one and there is no parameter that presets
     * it, so the player has to change it on Stripe's own page. Saying so
     * plainly beats an underpaid booking nobody notices until the pitch is
     * short of money on the day.
     */
    partyOnlineQuantity: "Set quantity to {seats} on the payment page.",
    /* --- awaiting an online payment (round 12, item 5) --- */
    awaitingTitle: "Waiting for your payment",
    awaitingBody:
      "Your spot is held for {minutes} minutes while the payment goes through. This page updates by itself once it does.",
    awaitingExpiredTitle: "Payment not received",
    awaitingExpiredBody:
      "We did not see a payment in time, so the spot went back to the game. You can try again if there is still room.",
    awaitingAttentionTitle: "We are checking your payment",
    awaitingAttentionBody:
      "Your payment arrived but we could not give you a spot. Someone is looking at it and will be in touch — do not pay again.",
    awaitingSeatGone:
      "This game filled up while you were away, so there is nothing to pay for. Nothing was charged.",
    awaitingRetry: "Try the payment again",
    // Cancellation reassurance, shown before the player commits. The window is
    // never written as a literal: `cancellationReassurance()` picks the kickoff
    // wording under policy v1 (`cutoffHoursBeforeStart: 0`) and interpolates
    // {hours} into the cutoff wording if a v2 policy introduces a lead time.
    cancelReassuranceKickoff:
      "Cancel anytime before kickoff for full wallet credit.",
    cancelReassuranceCutoff:
      "Cancel up to {hours}h before kickoff for full wallet credit.",
    confirmBooking: "Confirm booking",
    /*
     * THE FULL STOP (round 13, item 10). Shown on the confirmation screen for
     * a CONFIRMED booking however it got there — credits, a seed account, or
     * the Stripe webhook — because those are one fact to the reader and differ
     * only in the sentence underneath.
     */
    bookingConfirmed: "Booking confirmed",
    reserved: "Spot reserved",
    confirmed: "Payment confirmed",
    creditApplied: "Credit applied",
    amountDue: "Amount due",
    /*
     * THE INSUFFICIENT-CREDITS STATE (§3 screen 4), and the ruling behind its
     * wording is worth keeping next to it.
     *
     * A CONDITION, NEVER A FIGURE. It says the wallet is short, not by how
     * much — no "you are 50 CZK short". A shortfall in crowns re-introduces
     * the unit the credits ruling removed, on the one screen whose job is to
     * teach that a game is one credit.
     *
     * AND IT NEVER BLOCKS THE BOOKING. The spot is already reserved by the
     * time this renders; `create_booking` applies what credit there is and
     * falls back rather than failing. So this is an offer beside the QR, not
     * a gate in front of it — the secondary route is the existing payment,
     * and it is always present.
     *
     * `{percent}` is COMPUTED from the tier table at render time, floored.
     * Hardcoding "23" would drift the first time a tier price moved, and a
     * stale discount claim is a promise the pass page does not keep.
     */
    notEnoughCreditsTitle: "Not enough credits",
    notEnoughCreditsBody:
      "A game costs 1 credit. Get a pass and save up to {percent} %, or pay this one by QR.",
    getCredits: "Get credits",
    payByQrThisGame: "Pay by QR for this game",
    cancelBooking: "Cancel my booking",
    /*
     * §3 screen 5's confirm dialog. `window.confirm` used to carry this — a
     * browser chrome box that cannot be styled, cannot say what the refund is,
     * and reads on a phone as the page having been hijacked. It also had
     * nowhere to put a FAILURE, which §3 requires to appear inside the dialog.
     */
    cancelTitle: "Cancel your spot?",
    cancelKeep: "Keep my spot",
    cancelFailed: "We couldn't cancel that. Your spot is unchanged.",
    /*
     * RULING O, CREDIT HALF ONLY. What a player gets back is wallet credit,
     * never money — `policy.cancellation.refundAs` is "credit" and there is no
     * cash-refund path anywhere in the system. Saying "refund" here would
     * promise the half that is quarantined.
     */
    refundToWallet: "What you paid goes back as wallet credit.",
    /*
     * POLICY v2's OTHER HALF, and the dialog must say it.
     *
     * Inside the refund cutoff the spot is still released — cancelling stays
     * open to kickoff — but nothing is credited. A confirmation dialog that
     * went on saying "what you paid goes back as wallet credit" while taking
     * 200 CZK would be the product lying at the exact moment a player is
     * deciding, which is worse than having no dialog at all.
     *
     * IT STILL ENCOURAGES THE CANCELLATION. Freeing the spot is worth more to
     * everyone else than the player's silence, so the sentence states the cost
     * and then says the useful thing rather than warning them off.
     */
    refundLostLate:
      "It is less than {hours} hours to kickoff, so this one is not credited back. Cancelling still frees your spot for someone else.",
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

  profile: {
    /*
     * Ruling L's six edit fields, plus the position chips' labels.
     *
     * The labels are TRANSLATED and the codes are not — `lib/players/positions.ts`
     * holds the catalog, and `players_positions_catalog` enforces it. A column
     * of translated words could not be grouped by, and the CHECK would have to
     * list every translation.
     */
    editDetails: "Edit details",
    saveProfile: "Save profile",
    cancelEdit: "Cancel",
    displayName: "Display name",
    position: "Preferred position",
    positionHint: "Pick as many as you play.",
    skillLevel: "Skill level",
    nationality: "Nationality",
    phone: "Phone",
    phoneHint: "Only the organizer of a game you have booked can see it.",
    email: "Email",
    /*
     * POINTS AT THE DISPLAY BLOCK, not "the account controls below". The
     * control it used to point at was a text link at the foot of the page,
     * which the nav pill covered — visible, enabled and unclickable. It now
     * sits beside the address in the display view, one tap from here.
     */
    emailChangeHint: "Close this form to change your email address.",
    notSet: "Not set",
    saved: "Profile saved",
    saveFailed: "We could not save that. Please try again.",
    positions: {
      gk: "Goalkeeper",
      def: "Defender",
      mid: "Midfielder",
      att: "Attacker",
    },

    /*
     * THE REBUILT PROFILE (visibility round, item 3).
     *
     * The meta line is COUNTRY, NOT CITY. The reference screen reads
     * "Bangkok · since Aug 2026" and there is no city anywhere in this schema —
     * `players` holds `country` as an ISO 3166 code and nothing finer. A city
     * would be a new column, which this front-end round does not get to add,
     * and inferring one from a country is a guess printed under someone's face.
     *
     * `{date}` is a month and a year in the reader's language, formatted by
     * `Intl` at the render site rather than assembled from a translated month
     * list — see `memberSince`'s use in `ProfileIdentity`.
     */
    memberSince: "since {date}",

    tabOverview: "Overview",
    tabGames: "My games",
    tabSettings: "Settings",

    /*
     * LOWER CASE, and it is not an oversight. These sit UNDER their numbers as
     * captions, which is the one place ruling B's sentence case would look
     * wrong — "Games played" under a 34px numeral reads as a heading for the
     * thing below it rather than as a label for the thing above.
     *
     * THREE FORMS EACH, selected by `Intl.PluralRules` in
     * `lib/profile/statLabel.ts`. No `{n}`: the number is the element above, so
     * only the noun agrees. English never reaches the `Few` form — CLDR gives
     * it `one` and `other` only — and it is written anyway so the three tables
     * have the same shape and a translator is never guessing which keys exist.
     */
    statGamesOne: "game played",
    statGamesFew: "games played",
    statGamesMany: "games played",
    statHoursOne: "hour on pitch",
    statHoursFew: "hours on pitch",
    statHoursMany: "hours on pitch",
    statVenuesOne: "pitch played",
    statVenuesFew: "pitches played",
    statVenuesMany: "pitches played",

    badgesTitle: "Badges",
    /** `{earned} of {total}` — the counter beside the heading. */
    badgesCount: "{earned} of {total}",

    /*
     * THE FIVE BADGES. Name and requirement are separate keys because the
     * requirement is shown on the LOCKED state as the thing to aim at, and a
     * name with the number folded into it ("Play 5 games") reads as an
     * instruction rather than as something you own once you have it.
     *
     * The hints state the threshold in words. They are the one place in this
     * feature where a number is written down twice — the other is
     * `BADGE_THRESHOLDS` — and the pairing is asserted by a unit test, because
     * a hint that says 5 beside a threshold of 6 is worse than no hint.
     */
    badges: {
      firstGame: "First game",
      firstGameHint: "Play one game",
      regular: "Regular",
      regularHint: "Play 5 games",
      veteran: "Veteran",
      veteranHint: "Play 20 games",
      explorer: "Explorer",
      explorerHint: "Play at 3 different pitches",
      ironLegs: "Iron legs",
      ironLegsHint: "Spend 10 hours on the pitch",
    },
  },

  account: {
    // --- /my-games (v1.2 §7) -------------------------------------------------
    myGamesTitle: "My games",
    myGamesLink: "See all my games →",
    myGamesEmpty:
      "You have not claimed a spot yet. Pick a game from the board and your fixtures will show up here.",
    myGamesEmptyCta: "Find a game →",
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
    historyTitle: "Your history",
    gamesPlayedLabel: "Games played",
    noShowsLabel: "No-shows",
    upcomingTitle: "Coming up",
    pastTitle: "Already played",
    pastEmpty: "Nothing played yet — your first game will show up here.",
    attendancePresent: "Turned up",
    attendanceNoShow: "Marked no-show",

    topupTitle: "Top up your wallet",
    topupLede: "Add credit now, and it applies to your next booking automatically.",
    /*
     * THE WALLET IS CREDITS, AND PASSES ARE THE ONLY ADVERTISED WAY TO GET
     * THEM. This pointed at `/account/topup`, an arbitrary-amount chooser
     * that ruling N already removed from the player UI — and "top up credit"
     * described a cash wallet the product's language no longer has.
     *
     * The RPC behind that page stays: it is the reconciliation path for a
     * mispaid pass, and `/account/topup/[id]` still renders the QR every pass
     * purchase lands on. What is gone is the entry point advertising it.
     */
    topupCta: "Get a game pass",
    topupAmountLabel: "Amount",
    topupCustomLabel: "Or another amount (CZK)",
    topupSubmit: "Get the payment QR",
    topupOutOfRange: "Choose an amount between 50 and 2000 CZK.",
    topupPendingTitle: "Waiting for your payment",
    topupPendingBody:
      "Scan the code in your banking app. Your wallet updates once the organizer confirms the payment arrived.",
    topupConfirmedTitle: "This top-up is already in your wallet.",
    topupBackToAccount: "← Back to my account",

    photoTitle: "Profile photo",
    coverChange: "Change cover",
    photoUpload: "Upload a photo",
    photoReplace: "Replace photo",
    photoBadType: "Use a JPG, PNG or WebP image.",
    photoTooBig: "That image is over 2 MB. Pick a smaller one.",
    photoUploadFailed: "The photo didn't upload. Try again.",
    /*
     * The UPLOADING state (§3 screen 7, §4). It was `common.loading` — the
     * generic word this product uses for every wait — on the one control where
     * the wait is long enough to need saying what is happening: a photo is
     * cropped in the browser and then pushed to storage.
     */
    photoUploading: "Uploading your photo…",

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

    // The two security controls read as links, in the same voice as the
    // deletion link they sit above (§3.3). Verbs, not nouns: these are things
    // you do, and "Password" alone would read as a heading.
    changePasswordLink: "Change my password",
    changeEmailLink: "Change my email",
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
    // "FAQ", not "Questions". The panel beside it is a list of numbers and the
    // one under it is a person — this heading has to be recognised as a
    // convention at a glance rather than read as a word.
    title: "FAQ",
    /*
     * THE OWNER'S FOUR (round 13, item 11), replacing six.
     *
     * ~~"When should I show up?" (10 minutes before kickoff) and "What if I
     * can't make it?" (cancel anytime for full wallet credit)~~ are gone —
     * the second is on the booking screen already, above the button it
     * concerns, which is where a cancellation policy is actually read.
     *
     * EVERY ANSWER HERE WAS CHECKED AGAINST THE CODE BEFORE IT SHIPPED, which
     * is the point of the item rather than a courtesy:
     *
     *   PAYMENT — rewritten. It said "scan the QR from your banking app",
     *   which item 6 retired. Card, wallet, credits and cash are what the
     *   booking screen actually offers.
     *
     *   THE WAITLIST — VERIFIED TRUE. `notify_waitlist` stamps every entry and
     *   emits `waitlist_notified` in one transaction, and
     *   `notifyWaitlistForGame` mails everyone it returns. It is driven from
     *   BOTH paths that can free a spot: a player cancelling
     *   (`app/account/actions.ts`) and the expiry sweep
     *   (`app/api/cron/expiry/route.ts`). The answer says EMAIL rather than
     *   "we'll let you know", because the bell does not carry it — see the
     *   gap recorded in docs/REQUESTS.md — and it says everyone is told at
     *   once, because the race is settled by `create_booking`'s capacity
     *   check and a reader who thinks they have been offered a reserved spot
     *   has been misled.
     *
     *   LEVELS — verified. `create_booking` never consults skill (§5.3,
     *   REQ-GAME-011), so a badge really is a signal and not a gate.
     */
    items: [
      {
        q: "What should I bring?",
        a: "Shoes and yourself. Bibs, gloves and balls are provided.",
      },
      {
        q: "How do I pay?",
        a: "By card or mobile wallet when you book, with credits from a game pass, or cash at the pitch.",
      },
      {
        q: "What if the game is full?",
        a: "Join the waitlist. Everyone on it is emailed the moment a spot opens, and the first to claim it takes it.",
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
    topupsTitle: "Wallet top-ups",
    topupsLede:
      "Pending top-ups, sorted by variable symbol — the same order as your bank statement. Leave the amount blank to credit what was asked for.",
    topupsEmpty: "No top-ups waiting.",
    topupsConfirm: "✓ Received",
    // One label for all five exports — see components/admin/ExportCsvLink.tsx.
    exportCsv: "Export CSV",
    navTopups: "Top-ups",
    navSite: "Home page",

    // --- site settings (§6) --------------------------------------------------
    siteTitle: "Home page",
    siteLede:
      "What the landing page tells signed-out visitors. Every change is recorded against your account.",
    /*
     * WHAT THESE TWO NUMBERS MEAN — kept as a comment because the on-screen
     * hints were removed (controls only), and the meaning is not recoverable
     * from the labels.
     *
     * `siteGamesPerWeek` renders with a `+` after it, so it is the FLOOR the
     * organizer is willing to promise, NOT last week's count. It was computed
     * from the trailing seven days until v1.2, which advertised a quiet
     * fortnight as if it were the normal rate.
     *
     * `siteActivePlayers` is the community INCLUDING the WhatsApp crowd, not
     * the number of rows in `players`. Also rendered with a `+`.
     */
    siteGamesPerWeekLabel: "Games every week",
    siteGamesPerWeekSubmit: "Save number",
    siteActivePlayersLabel: "Active players",
    siteActivePlayersSubmit: "Save number",
    sitePotmLabel: "Player of the month",
    sitePotmHint: "Renders their photo, or their initials if they have none.",
    sitePotmNone: "— nobody —",
    sitePotmSubmit: "Save pick",

    // --- shell ---------------------------------------------------------------
    title: "Admin",
    navDashboard: "Dashboard",
    navGames: "Games",
    navPlayers: "Players",
    /* --- Financials (round 7, item 8, p19). Admin copy is English only. --- */
    financialsTitle: "Financials",
    periodThisMonth: "This month",
    periodLastMonth: "Last month",
    periodAllTime: "All time",
    revenueLabel: "Revenue",
    revenueVsPrevious: "vs the month before",
    gamesSettledLabel: "Games settled",
    avgPerGameLabel: "Avg per game",
    revenueByWeek: "Revenue by week",
    outstandingLabel: "Outstanding",
    unpaidSpots: "{count} unpaid spots",
    /* The frame's `View unpaid →` has no route; this says where they are
       instead of linking nowhere. See the page header. */
    unpaidWhere: "Settle these on each game's admin page.",
    operationsTitle: "Operations",
    /* --- the dashboard (round 8, item 2, p14) --- */
    dashboardTitle: "Dashboard overview",
    dashboardUpcoming: "Upcoming games",
    dashboardAllGames: "All games →",
    dashboardEmpty: "Nothing on the board.",
    tileUpcoming: "Upcoming games",
    tilePlayers: "Total players",
    tileNewPlayers: "New players (7d)",
    tileRevenue: "Revenue (month)",
    quickActions: "Quick actions",
    quickCreateGame: "+ Create game",
    /* p14's other two quick actions, given destinations in round 10 item 1. */
    quickAddVenue: "+ Add venue",
    /*
     * THE DASHBOARD ROW'S STATUS, IN p14's WORDS (round 10, item 1).
     *
     * The rows were printing the `game_status` enum through a `capitalize`,
     * so a live game read `Published` and a full one read `Full`. p14 draws
     * `Confirmed` and `Waitlist`, which are the words for what an organizer
     * actually needs to know: the game is on, and new signups now queue.
     * Anything outside the two states the dashboard queries falls back to the
     * enum, which is a developer reading a row that should not be there.
     */
    dashboardStatus: {
      published: "Confirmed",
      full: "Waitlist",
    } as Record<string, string>,
    quickExportData: "Export data",
    /* --- admin player detail (round 7, item 9) --- */
    adminActionsTitle: "Admin actions",
    /* --- notifications (round 7, item 5). Admin copy is English only. --- */
    notifyTitle: "Notify players",
    notifyLede: "Everyone signed in sees this in their bell. Nothing is emailed.",
    notifyOfferTitle: "Tell the players?",
    notifyOfferLede: "A draft — edit it, send it, or dismiss it. Nothing goes out until you press send.",
    notifyTitleLabel: "Headline",
    notifyBodyLabel: "Message",
    notifySend: "Send notification",
    notifyDismiss: "Not now",
    notifySent: "Sent.",
    notifyTitleRequired: "A headline is required.",
    notifyBodyRequired: "A message is required.",
    /* Drafts offered after an admin action. `{name}` and `{when}` are filled
       from the row that was just written. */
    notifyDraftGameTitle: "New game published",
    notifyDraftGameBody: "{name} — {when}. Claim your spot.",
    notifyDraftVenueTitle: "A new pitch has been added",
    notifyDraftVenueBody: "{name} is now on the board.",
    grantNoteRequired: "A note is required — say why this credit was granted.",
    contactTitle: "Contact",
    contactEmail: "Email",
    contactPhone: "Phone",
    contactNone: "Not set",
    recentTransactions: "Recent transactions",
    noTransactions: "No movements yet.",
    navStats: "Financials",
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
    /* --- venue management (round 13, item 24) --- */
    venuesTitle: "Venues",
    venuesLede:
      "Every ground you play at. A venue's photo, map link and amenities are inherited by every game there.",
    venuesEmpty: "No venues yet.",
    venueCreate: "Add venue",
    venueCreated: "Venue added",
    venueSave: "Save venue",
    venueSaved: "Venue updated",
    venueNewHeading: "Add a venue",
    venuePitchNameHint: "The ground's default pitch. A game can name its own instead.",
    venuePresetsHeading: "Inherited by every game here",
    // The two facts you scan a venue list for, on the closed row.
    venueHasPhoto: "Photo set",
    venueNoPhoto: "No photo",
    venueNoPitchName: "No pitch name",
    venueImageLabel: "Image file",
    venueImageHint:
      "A file under public/venues/, e.g. prazacka.jpg.",
    // --- venue photograph (§5.4, migration 34) --------------------------------
    venueAmenitiesIncluded: "What's included",
    venueAmenitiesPitch: "Pitch amenities",
    venueAmenitiesTitle: "What this pitch provides",
    venueAmenitiesHint:
      "Ticked items appear on the game page as \"What's included\". This is a property of the VENUE, so every game at this pitch shows the same set — and unticking one is how you stop the page promising it.",
    venueAmenitiesSubmit: "Save what's provided",
    venueAmenitiesFailed: "We could not save that. Please try again.",
    venuePhotoTitle: "Pitch photo",
    venuePhotoUpload: "Upload a photo",
    venuePhotoReplace: "Replace the photo",
    venuePhotoHint:
      "Landscape, taken at the pitch. It shows on every game here, above the map. Up to 4 MB, jpg/png/webp.",
    venuePhotoBadType: "That is not a jpg, png or webp.",
    venuePhotoTooBig: "That file is over 4 MB. Photograph it again at a lower size.",
    venuePhotoFailed: "The upload did not go through. Try again.",
    venuePhotoNoVenue: "Save the game first — a photo attaches to a venue, and this one is new.",
    venueMapQueryLabel: "Map search (optional)",
    venueMapQueryHint: "Defaults to the venue name.",
    startsAtLabel: "Kick-off",
    capacityLabel: "Capacity",
    capacityHint: "Cannot go below the players already booked.",
    priceLabel: "Price (CZK)",
    priceHint: "Future bookings only.",
    formatLabel: "Format (optional)",
    formatHint: "Like 6v6, or 6v6v6 for a three-way.",
    surfaceLabel: "Surface (optional)",
    surfaceNone: "Not specified",
    surfaceOptions: {
      turf: "Turf",
      grass: "Grass",
      indoor: "Indoor",
      sand: "Sand",
    },
    notesLabel: "Notes (optional)",
    notesHint: "Gate codes, parking, what to bring.",

    // --- organizer, duration, skill (Phase 2 §5) ------------------------------
    organizerHeading: "Organizer",
    organizerNameLabel: "Organizer name",
    organizerNameHint: "Shown publicly.",
    organizerPhoneLabel: "Organizer phone (optional)",
    // Says where the number goes, because an organizer deciding whether to give
    // one needs to know that before they type it, not after.
    organizerPhoneHint:
      "Only players holding a spot can see it.",
    durationLabel: "Duration (minutes)",
    durationHint: "30 to 180. Empty uses 60.",
    skillHeading: "Skill level",
    skillHint:
      "Leave everything unticked for all levels — that shows no badge. Ticking every level means the same thing.",
    skillNote: "Booking is never refused on skill. This is a signal, not a gate.",
    skillOptions: {
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
    },
    subsLabel: "Substitutes per team (optional)",
    subsHint: "Display only — limits nothing.",
    createGame: "Create as draft",
    createGameHint: "A new game is a draft; publishing is a separate step.",
    saveGame: "Save changes",
    saved: "Saved",
    draftNotPublic: "This game is a draft — it is not on the public games list.",
    /* --- unfinished games (round 9, item 7) --- */
    unfinishedTitle: "Unfinished games",
    unfinishedLede:
      "Started but never published. Open one to finish it, or cancel it.",
    unfinishedOpen: "Open →",
    /*
     * Round 7 item 6: creating a game publishes it, so a draft is now either
     * one made before that change or one whose publish call failed. This
     * string is the second case, shown on the create form.
     *
     * ADMIN COPY IS ENGLISH ONLY — the panel is English and `nav.admin` is in
     * INTENTIONALLY_UNTRANSLATED for that reason.
     */
    createdNotPublished:
      "The game was created but not published. Open it and press Publish →",

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
    formatInvalid: "Format looks like 6v6, or 6v6v6 — two or three numbers with a v between them.",
    /* --- pitch name (migration 41, round 9). Admin copy is English only. --- */
    pitchNameLabel: "Pitch name",
    pitchNameHint:
      "Empty uses the venue's own. Names you type are remembered.",
    pitchNameTooLong: "A pitch name is at most 60 characters.",
    pitchNameSuggestions: "Pitch names already in use",
    notesTooLong: "Notes are limited to 500 characters.",
    organizerNameRequired: "Name whoever is running this game.",
    organizerNameTooLong: "The organizer name is limited to 60 characters.",
    organizerPhoneInvalid: "A phone number is between 3 and 32 characters, or empty.",
    durationInvalid: "Duration must be a whole number of minutes between 30 and 180.",
    subsInvalid: "Substitutes per team must be a whole number between 0 and 20.",
    invalidTransition: "That is not possible in this game's current state.",
    siteSettingInvalid: "That is not a whole number of players.",

    // --- player detail (§7, REQ-ADMIN-001) -----------------------------------
    playerDetailTitle: "Player",
    playerNoEmail: "No email — shadow player",
    playerCountry: "Country",
    playerSkill: "Skill",
    playerBalance: "Wallet",
    playerGamesPlayed: "Games played",
    playerNoShows: "No-shows",
    playerGamesTitle: "History",
    playerGamesLede:
      "Every booking, newest first. No-show marking is available on a game that has already kicked off — the same write the game roster performs.",
    playerGamesEmpty: "No bookings yet.",
    playerOpen: "Open →",
    photoRemove: "Remove photo",
    photoRemoved: "Photo removed",
    photoRemoveConfirm:
      "Remove this player's photo? The image is deleted from storage and cannot be recovered.",
    siteSettingUnknownKey: "That setting does not exist.",

    /* --- guests (round 11, part A) -------------------------------------------
     *
     * ~~The shadow-player flow: "Add a player" created a real `players` row for
     * someone who booked over WhatsApp, to be claimed or merged later.~~
     *
     * REPLACED BY GUESTS. The shadow flow made an identity in order to hold a
     * seat, and almost none of those identities were ever claimed — so the
     * players table filled with people who had no account, no email and no way
     * to get one, each of which had to be merged by hand if they ever did sign
     * up. A guest is the seat without the identity.
     *
     * Existing shadow players are untouched and still render, under their own
     * names, as guests. The merge tool's copy is gone with the tool.
     */
    guestsTitle: "Guests",
    guestsLede:
      "Seats for people with no account — someone's friend, a regular who books over WhatsApp. They take up space on the pitch and show as Guest 1, Guest 2 in every lineup.",
    guestsCount: "Guests on this game",
    guestsAdd: "Add a guest",
    guestsRemove: "Remove a guest",
    guestsSaved: "Guests updated",
    guestsNone: "No guests on this game.",
    guestsNoRoom: "The pitch is full — there is no seat for another guest.",
    guestsInvalid: "That is not a number of guests.",
    // Beside a name on the admin roster: "+2 guests". The booking is one row
    // with one attendance mark, because it is one decision.
    rosterParty: "+{n} guests",
    /* --- contact details, shown in the footer dialog (round 13, item 18) ---
     * Named `siteContact*` because `contactTitle` / `contactEmail` /
     * `contactPhone` are already taken above by the GAME organizer's contact
     * block, which is a different thing entirely.
     */
    siteContactTitle: "Contact info",
    siteContactLede:
      "What the footer's Contact dialog shows. Saved straight away — no deploy.",
    siteContactEmailsLabel: "Email addresses",
    siteContactEmailsHint: "One per line. At least one; the built-in address is used if you leave it empty.",
    siteContactPhonesLabel: "Phone numbers",
    siteContactPhonesHint: "One per line. Leave empty to show no phone number at all.",
    siteContactSave: "Save contact info",
    siteContactSaved: "Contact info updated",
    /* --- payments that arrived with no seat (round 12, item 5c) --- */
    attentionTitle: "Payments needing attention ({n})",
    attentionLede:
      "Money arrived and no spot could be given. Nothing resolves these automatically — refund or seat each one by hand.",
    attentionSeats: "seats",
    // Generic, and generic on purpose: every RPC that takes a player id can
    // raise this, and the merge tool that used to own the message is gone.
    playerNotFound: "No such player.",

    // --- stats ---------------------------------------------------------------
    statsTitle: "Stats",
    statsLede:
      "Everything below is a query over the event log, bounded by the window you pick. Nothing here writes.",

    // --- the window (§7, REQ-ADMIN-006) --------------------------------------
    // Prague calendar windows, not rolling spans: "this week" means the week
    // the games were played in, and a rolling number moves while you read it.
    statWindowDay: "Today",
    statWindowWeek: "This week",
    statWindowMonth: "This month",
    statWindowRange: "{from} — {to}",

    // --- the metrics that arrived in Phase 19 --------------------------------
    statFillRate: "Fill rate",
    statFillRateHint: "Spots taken against capacity, over games in this window.",
    statRevenue: "Confirmed revenue",
    // The distinction the metric exists to make.
    statRevenueHint:
      "Money that arrived. Credit applied is excluded — that is a liability being discharged, not a payment.",
    statNewReturning: "New vs returning",
    statNewReturningHint:
      "A booking is new if it is that player's first ever, whenever their first was.",
    statNew: "new",
    statReturning: "returning",
    statCancellations: "Cancellations",
    statCancellationsHint: "Split by whether credit was issued — that is, whether money had been applied.",
    statCancellationsWithCredit: "with credit",
    statNoShow: "No-show rate",
    statNoShowHint: "Of the bookings whose attendance has been marked, on games in this window.",
    statOf: "of",
    // Shown in place of every tile when the window holds nothing. "Today"
    // legitimately holds nothing most days, and a page of dashes reads as
    // broken rather than as empty.
    statsEmptyWindow: "Nothing happened in this window.",

    // --- players, credit grants, merge ---------------------------------------
    playersTitle: "Players",
    playersEmpty: "No players yet.",
    balanceLabel: "Wallet",
    bookingsLabel: "Bookings",
    shadowTag: "Shadow",
    seedTag: "Seed",
    adminTag: "Admin",
    noEmail: "no email",
    /* The player search (admin restyle). Admin copy is English only — one
       person uses it — so these carry no CS/RU overlay by design. */
    playerSearchLabel: "Search players",
    playerSearchPlaceholder: "Name, email or phone…",
    playerSearchClear: "Clear",
    playerSearchEmpty: "No player matches \u201c{q}\u201d.",
    playerSearchCount: "{shown} of {total}",
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

    /*
     * ~~The merge tool's copy.~~ REMOVED IN ROUND 11 with the tool itself.
     * `merge_players` survives as an RPC with no UI — it is the only way to
     * repair a split identity if one is ever discovered, and deleting a
     * repair because its button went away is how a database gets stuck.
     */


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
    /*
     * Only reachable by a client that ignored the control — it offers at most
     * the policy ceiling. Says the rule rather than the number, because the
     * number lives in two places and this string would be the third.
     */
    partyTooLarge: "That is more guests than one booking can hold.",
    /*
     * Only reachable by a client that ignored the button, which says "Coming
     * soon" when a tier has no link. It never offers the single-game link as a
     * substitute: tier prices are discounted, and paying one through the
     * per-game link charges the undiscounted price.
     */
    passNotConfigured: "This pass is not on sale yet.",
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
    /**
     * Top-up receipt. Emails stay English — there is no per-player language in
     * the database, only a cookie (see lib/i18n/locales.ts).
     */
    topupReceipt: {
      subject: "Your wallet has been topped up",
      heading: "Money in the wallet",
      body: "We received {amount} and added it to your wallet.",
      // The three that differ only for a pass (§4.2, REQ-PASS-005).
      receivedLabel: "Received",
      creditedLabel: "Credited",
      expiresLabel: "Expires",
      noExpiry: "Never",
      balanceLabel: "New balance",
      spendNote:
        "It applies automatically to your next booking — no code to enter.",
      cta: "Open my account",
    },

    /**
     * The three-day heads-up (§4.2, REQ-PASS-004).
     *
     * Links to the GAMES LIST, not to the account page. Someone told their
     * credit is running out does not need to look at a balance — they need to
     * book something, and there is still time.
     */
    passExpiring: {
      subject: "Your credit runs out in 3 days",
      heading: "Use it before it goes",
      body: "You have {amount} of pass credit left and it expires on {date}.",
      remainingLabel: "Left",
      gamesLabel: "Roughly this many games",
      expiresLabel: "Expires",
      cta: "Find a game",
    },

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

  /**
   * Toast copy (§8, REQ-UX-002).
   *
   * Five moments, one component. The set is closed — `lib/ux/toast.ts` carries
   * the kinds — so a toast is never free text arriving from a query string.
   */
  /**
   * The game pass (§4.2).
   *
   * A pass is DISCOUNTED WALLET CREDIT WITH AN EXPIRY — not a ticket and not a
   * counter of games — and the copy says so, because a player who thinks they
   * bought five games will feel cheated when a game costs 200.
   */
  pass: {
    title: "Game pass",
    lede: "Pre-buy games at a discount. It goes into your wallet as credit and applies itself to your next booking.",
    /*
     * "Game Pass" IS THE PRODUCT NAME and stays in English in every locale —
     * see the Czech and Russian overlays, which translate the strapline beneath
     * it and leave this alone. A name that changes per locale is a name nobody
     * can be told about in a WhatsApp group where three languages are spoken.
     *
     * There is no CTA string any more: the whole panel is the link and the
     * arrow says so. "See the passes →" beside a title and a strapline was the
     * third phrase that pushed the panel past a 360px viewport.
     */
    panelTitle: "Game Pass",
    panelBody: "Pre-buy games at a discount",
    /*
     * THE 1-GAME TIER IS GONE (ruled 2026-08-02), and with it `tierOneGame` and
     * `tierNoSaving`. It was listed at par — 150 for 150, never expiring — on
     * the reasoning that a reference point makes the other discounts legible.
     * In practice it was an "offer" that offered nothing, sitting first, where
     * the best offer should be; a reader who stopped at the top of the page
     * concluded the pass was not a discount at all. The reference price is
     * still stated once, in "How it works", which is where an explanation
     * belongs rather than in a card with a Buy button on it.
     *
     * The row is deleted from `pass_tiers` too (migration 36), not merely
     * hidden — a tier the page will not sell but `create_pass_topup` will still
     * accept is a price list with a second, invisible entry.
     */
    /*
     * THE CREDITS RULING: the unit is a credit, and one credit is one game.
     * These replace `tierGames`, which counted in games — the same quantity
     * under a different noun, and the ruling picks the noun the wallet, the
     * ledger and the tiers can all share.
     *
     * THREE FORMS BECAUSE CZECH AND RUSSIAN HAVE THREE. English uses `few`
     * and `many` identically and loses nothing by it; the alternative is a
     * two-form table that silently renders "5 kredity" in Czech. Which form
     * is chosen is `Intl.PluralRules`' decision — see lib/pass/credits.ts.
     */
    // `{n}`, not a literal 1: Russian routes 21, 31 and 101 through the
    // SINGULAR, so a hardcoded "1" here renders a 21-credit wallet as
    // "1 кредит". English and Czech only ever reach this form at one, so the
    // placeholder costs them nothing and removes the trap.
    creditsOne: "{n} credit",
    creditsFew: "{n} credits",
    creditsMany: "{n} credits",
    /*
     * The equivalence, stated where the credits are counted rather than
     * buried in the how-it-works copy. It is the sentence that makes every
     * other number on these two screens legible: without it "5 credits" is a
     * unit the reader has to convert, and conversion is exactly what counting
     * in credits was supposed to remove.
     */
    creditEqualsGame: "1 credit = 1 game",
    tierPerGame: "{amount} a game",
    tierSaving: "Save {amount}",
    // Stated LOUDLY and before the button, per §4.2: an expiry discovered
    // after purchase is a complaint; an expiry read before it is a choice.
    /*
     * DAYS, NOT MONTHS (owner's call), and "payment clears" rather than
     * "purchase".
     *
     * The clock starts when `confirm_topup` runs — `now() + interval` at
     * CONFIRMATION, not when the pass was requested. A player who asks for a
     * pass on Monday and pays on Wednesday keeps the full window; telling them
     * it runs "after purchase" would understate what they bought by two days,
     * which is a statement about money and therefore one to get right.
     *
     * `{days}` is derived from the tier's `expires_months`, so the 2-month
     * tiers say 60 rather than all five claiming 30. See PassTierCard.
     */
    tierExpiresDays: "Expires {days} days after payment clears",
    tierNeverExpires: "Never expires",
    tierBuy: "Buy this pass",
    /*
     * The SALE treatment (polish round). `tierBuy` was a full-width volt
     * button on every card, which made five cards shout the same word and
     * left nothing on them louder than the control. The purchase is the last
     * step, not the pitch — so it goes quiet and the per-game price gets the
     * volume.
     */
    tierPurchase: "Purchase",
    /** On the 12-credit tier only. */
    tierMostPopular: "Most popular",
    // The honest framing of what is actually stored.
    equivalence: "≈ {count} games",
    howItWorks: "How it works",
    /*
     * THE OWNER'S WORDING, VERBATIM (round 13, item 15).
     *
     * ~~"You pay by QR like any other top-up..."~~ — QR is retired product-wide
     * (item 6), so the old body described a rail that no longer exists. It also
     * explained the soonest-expiring-first allocator, which is true and is not
     * what somebody reads this box to find out.
     */
    howItWorksBody:
      "You pay via your credit card or mobile wallet. Once the payment is confirmed, the credits will be applied to your account automatically.",
    batchesTitle: "Your credit",
    batchesExpiring: "{amount} left · expires {date}",
    batchesNever: "{amount} · never expires",
    batchesNone: "No expiring credit.",
    // Under the sticky claim button on a game page. Someone about to pay full
    // price for one game is exactly who pre-buying is worth anything to.
    tryThePass: "Or try the Game Pass →",
  },

  toast: {
    /*
     * THE INVENTORY, and what happened to it (§8).
     *
     * Contract §8 named five triggers. Three of them no longer have a source:
     *
     *   bookingCreated      the result is a server-rendered confirmation
     *                       SCREEN, and a toast announcing what the page in
     *                       front of you already says is noise
     *   bookingCancelled    same — the cancellation result is a screen
     *   linkCopied          ruling G deleted the control that fired it
     *
     * They are still defined and still called, because their call sites live
     * in the booking and cancellation flows that STAGE 6 rebuilds — retiring
     * the strings here would break live paths that this phase does not own.
     * They are removed with the flows, in phases 44 and 45.
     *
     * Two survive with a live source: `signedIn` and `topupConfirmed`. Neither
     * has a screen of its own to state the fact.
     *
     * `failed` is new, and it is what makes the error variant usable: an
     * assertive, non-auto-dismissing toast with nothing to say is a variant
     * that exists only in a component file.
     */
    bookingCreated: "You're in. Your spot is held.",
    signedIn: "Signed in.",
    // Names the amount, because "cancelled" alone leaves the question the
    // player actually has — where did the money go — unanswered.
    bookingCancelled: "Cancelled — the value is back in your wallet as credit.",
    topupConfirmed: "Top-up confirmed. Your balance is updated.",
    linkCopied: "Link copied.",
    /** The error variant. Deliberately blames nothing and offers the retry. */
    failed: "That didn't go through. Try again.",
  },

  notifications: {
    /* Round 7, item 5 — the in-app bell. Player-facing, so all three. */
    bellLabel: "Notifications",
    title: "Notifications",
    empty: "Nothing yet.",
  },

  common: {
    back: "Back",
    close: "Close",
    // The toast's own dismiss, distinct from a dialog's Close.
    dismiss: "Dismiss",
    loading: "Loading…",
    czk: "CZK",
  },
} as const;

export type Strings = typeof strings;
