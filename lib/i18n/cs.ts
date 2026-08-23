import type { StringsOverlay } from "@/lib/i18n/resolve";

/**
 * Czech.
 *
 * Player-facing copy only. The admin panel, the email templates and the
 * privacy page are deliberately absent — see `lib/i18n/locales.ts` for why
 * each one stays English.
 *
 * WHAT STAYS AS IT IS, in Czech as in every language:
 *   - The brand. "HRAJ FOTBAL" is already Czech and is a name, not a phrase.
 *   - Money. `formatCzk()` renders "200 CZK" everywhere; the amount a player
 *     reads here has to match the amount their banking app shows.
 *   - The payment vocabulary. VS is VS, a QR platba is a QR platba. These are
 *     the words on the Czech banking screen the player is about to open, and
 *     a payment sent with the wrong reference is a payment that arrives
 *     unmatched — the one failure in this product that costs manual work to
 *     undo.
 *
 * Register: the same second-person familiar tone the English uses ("ty", not
 * "vy"). This is a pickup football crew, not a bank.
 */
export const cs: StringsOverlay = {
  meta: {
    title: "Hraj Fotbal — pickup fotbal v Praze",
    description: "Jeden zápas, který se opakuje. Najdi hru, zaber si místo, přijď.",
  },

  nav: {
    cta: "Zaber si místo",
    games: "Zápasy",
    logIn: "Přihlásit se",
    homeShort: "Domů",
    pass: "Permanentka",
    myGames: "Moje zápasy",
    profileShort: "Profil",
    primary: "Hlavní navigace",
    profile: "Můj profil",
    home: "Hraj Fotbal — domů",
  },

  siteFooter: {
    privacy: "Soukromí",
    terms: "Podmínky",
    contact: "Kontakt",
    contactTitle: "Ozvi se nám",
  },

  notFound: {
    title: "Tady nic není",
    body: "Tenhle odkaz míří na stránku, která neexistuje — nebo na zápas, který už dávno skončil.",
    cta: "Mrkni, co se hraje →",
  },

  landing: {
    // DRAFT — flagged for the standing native-review batch.
    // Split at the first sentence; the period after line one is drawn in volt
    // by the component, so it is not in the string.
    heroLine1: "Hraj fotbal",
    heroLine2: "Kdykoli. Kdekoli.",
    vision: "Jeden zápas, který se opakuje. Najdi hru, zaber si místo, přijď.",
    heroCta: "Najít zápas →",
    scrollHint: "↓ SCROLLUJ",
    steps: [
      { index: "01", title: "Najdi zápas", body: "Zápasy kousek od tebe, každý týden." },
      {
        index: "02",
        title: "Zaber si místo",
        body: "Zajisti si místo zaplacením poplatku. Zbytek zařídíme.",
      },
      { index: "03", title: "Přijď a hraj", body: "Dojdi na hřiště a užij si zápas" },
    ],
    statsGamesLabel: "Zápasů každý týden",
    statsPlayersLabel: "Aktivních hráčů",
    nextMatchesLabel: "Nadcházející zápasy",
    nextMatchesAll: "Všechny zápasy →",
    potmTitle: "Hráč měsíce",
    potmEmpty: "Zatím nikdo — může to být klidně ty.",
    potmHours: "{hours} h na hřišti tenhle měsíc",
    community: {
      title: "Přidej se k nám",
      body: "Sleduj naše sítě a neuteče ti nic z dění v komunitě",
    },
    footer: {
      city: "· PRAHA",
    },
  },

  auth: {
    loginTitle: "Přihlášení",
    // DRAFT — flagged for the standing native-review batch.
    loginLede: "E-mail a heslo. Ještě žádné nemáš? Použij odkaz na obnovu.",
    signInSubmit: "Přihlásit se",
    invalidCredentials: "E-mail a heslo spolu nesouhlasí.",
    emailNotConfirmed:
      "Nejdřív potvrď e-mail — otevři odkaz, který jsme ti poslali při registraci.",

    // DRAFT — flagged for the standing native-review batch.
    forgotPasswordLink: "Zapomenuté heslo?",
    resetTitle: "Obnovit heslo",
    resetLede: "Pošleme ti e-mailem šestimístný kód. Zadej ho tady a nastav si nové heslo.",
    resetBackToLogin: "← Zpět na přihlášení",
    forgotPasswordLead: "Zapomněl jsi heslo, nebo sis ho ještě nenastavil?",
    forgotPasswordCta: "Poslat mi kód",

    setPasswordTitle: "Nastav si heslo",
    setPasswordLede: "Jsi přihlášený. Zvol si heslo a příště se obejdeš bez e-mailu.",
    setPasswordSubmit: "Uložit heslo",
    setPasswordSkip: "Teď ne — zůstanu u kódu",
    setPasswordFailed: "Heslo se nepodařilo uložit. Zkus to prosím znovu.",
    emailLabel: "E-mail",
    sendLink: "Poslat odkaz",
    linkSent: "Koukni do schránky — odkaz je na cestě.",
    otpLead: "Nebo zadej 6místný kód z e-mailu:",
    otpLabel: "6místný kód",
    otpSubmit: "Přihlásit se",
    otpInvalid: "Kód nesedí, nebo mu vypršela platnost. Vyžádej si nový.",
    otpMalformed: "Kód má šest číslic.",
    linkExpired: "Platnost odkazu vypršela. Vyžádej si nový.",
    signOut: "Odhlásit se",
    emailInvalid: "Tohle nevypadá jako e-mailová adresa.",
    linkSendFailed: "Odkaz se nepodařilo odeslat. Zkus to prosím znovu.",
    callbackFailed: "Tenhle přihlašovací odkaz je neplatný nebo už byl použitý.",
    callbackErrorTitle: "Přihlášení se nepovedlo",
    callbackRetry: "Vyžádat nový odkaz",
    callbackDetailLabel: "Technický detail",

    signupTitle: "Založ si účet",
    signupLede: "Jeden účet, jedna přezdívka — a jsi v sestavě.",
    signupFinishTitle: "Dokonči profil",
    signupFinishLede: "E-mail je potvrzený. Tohle je poslední krok.",

    passwordLabel: "Heslo",
    passwordHint: "Alespoň 8 znaků",
    passwordTooShort: "Použij alespoň 8 znaků.",

    countryLabel: "Země",
    countryPlaceholder: "Vyber svou zemi",
    countryInvalid: "Vyber prosím zemi ze seznamu.",

    skillLabel: "Jak hraješ?",
    skillHint: "Zobrazí se na profilu. Rezervaci ti to nikdy nezablokuje.",
    skillBeginner: "Začátečník",
    skillIntermediate: "Pokročilý",
    skillAdvanced: "Zkušený",
    skillRequired: "Vyber prosím úroveň.",

    // DRAFT — flagged for the standing native-review batch.
    phoneLabel: "Telefon",
    phoneRequired: "Potřebujeme telefon, aby se ti organizátor mohl ozvat kvůli zápasu.",
    phoneInvalid: "Telefonní číslo má 3 až 32 znaků.",
    phoneHint: "Vidí ho jen organizátor, a jen u zápasů, které máš zarezervované.",

    legalGroupLabel: "Než začneš",
    tosLabel: "Souhlasím s obchodními podmínkami.",
    tosLink: "Přečíst podmínky",
    tosRequired: "Pro pokračování prosím potvrď podmínky.",
    preferencesGroupLabel: "Nepovinné",

    emailTaken:
      "Účet s tímto e-mailem už existuje. Přihlas se — nebo použij kód, pokud ještě nemáš heslo.",
    signupFailed: "Účet se nepodařilo založit. Zkus to prosím znovu.",

    verifyTitle: "Potvrď svůj e-mail",
    verifyBody:
      "Poslali jsme odkaz na {email}. Otevři ho a účet je hotový — odkaz funguje na jakémkoli zařízení.",
    verifyHint: "Nic nepřišlo? Zkontroluj spam a pak to zkus znovu.",

    signUp: "Registrace",
    noAccountLead: "Ještě nejsi člen?",
    createAccountCta: "Registrace →",
    haveAccount: "Už máš účet?",
    // DRAFT — flagged for the standing native-review batch.
    googleContinue: "Pokračovat přes Google",
    googleSignUp: "Registrace přes Google",
    googleFailed: "Přihlášení přes Google se nepodařilo spustit. Zkus to prosím znovu.",
    authOr: "nebo",
    noAccount: "Jsi tu poprvé?",
    nicknameLabel: "Přezdívka",
    nicknameHint: "Písmena, číslice, mezery, _ a - · max. 20 znaků",
    nicknameInvalid: "Použij jen písmena, číslice, mezery, _ a - (max. 20 znaků).",
    nicknameTaken: "Tahle přezdívka je zabraná. Zkus jinou.",
    gdprLabel: "Souhlasím se zásadami ochrany osobních údajů.",
    gdprLink: "Přečíst zásady ochrany osobních údajů",
    gdprRequired: "Bez souhlasu se zásadami to bohužel nejde.",
    marketingLabel: "Posílejte mi e-maily o nových zápasech. (Nepovinné)",
    createAccount: "Založit účet",
  },

  games: {
    listTitle: "Nadcházející zápasy",
    empty: "Zatím žádný zápas na programu.",
    emptyTitle: "Žádné naplánované zápasy",
    emptyBody: "Nové zápasy přibývají každý týden.",
    emptyCta: "Přidej se do WhatsApp skupiny",
    spotsLeft: "volných míst",
    spotLeft: "volné místo",
    full: "Obsazeno",
    durationMin: "{n} min",
    past: "Odehráno",
    joinWaitlist: "Přidat se do fronty",
    fullNotice: "Zápas je plný — všechna místa jsou zabraná.",
    seeOtherGames: "Další zápasy →",
    onWaitlist: "Jsi ve frontě",
    waitlistJoined: "Jsi ve frontě. Napíšeme ti, jakmile se místo uvolní.",
    waitlistAlready: "Ve frontě na tenhle zápas už jsi.",
    // Round 16 item 11 — DRAFT.
    waitlistLeave: "Odejít z čekací listiny",
    waitlistLeftDone: "Z čekací listiny jsi odešel.",
    waitlistHint:
      "Jakmile se místo uvolní, dozvědí se to všichni ve frontě naráz — dostane ho ten, kdo si ho zabere první.",
    waitlistPosition: "Jsi #{position} ve frontě",
    waitlistConvertTitle: "Zaber uvolněné místo",
    waitlistConvertHint: "Vyber, jak chceš zaplatit, a místo je tvoje.",
    waitlistNotOnList: "Ve frontě na tenhle zápas nejsi.",
    waitlistJoinedTitle: "Jsi ve frontě",
    waitlistSpotOpenTitle: "Uvolnilo se místo",
    waitlistSpotOpenBody:
      "Všichni ve frontě se to dozvěděli naráz. Zaber si ho a je tvoje.",
    waitlistNotOnListTitle: "V téhle frontě nejsi",
    waitlistNotOnListBody:
      "Někdo si místo možná už vzal, nebo ses přihlásil k jinému zápasu.",
    waitlistSeeGame: "Zobrazit zápas",
    rosterTitle: "Sestava",
    rosterEmpty: "Zatím si nikdo nezabral místo",
    cancelled: "Tenhle zápas byl zrušený.",
    notFound: "Takový zápas neexistuje, nebo ještě není zveřejněný.",
    backToGames: "← Všechny zápasy",
    viewGame: "Zobrazit zápas",
    copyLink: "Kopírovat odkaz",
    copyLinkFailed: "Nepodařilo se zkopírovat — podrž adresní řádek.",
    dayFilterAll: "Vše",
    dayToday: "Dnes",
    dayTomorrow: "Zítra",
    dayTomorrowShort: "Zítra",
    rosterReserved: "drží místo",
    rosterConfirmed: "v sestavě",
    filledLabel: "OBSAZENO",
    joinNote: "Jedno ťuknutí a máš místo. Zaplať předem z mobilu.",
    openMap: "OTEVŘÍT MAPU ↗",
    mapAlt: "Mapa místa",
    venuePhotoAlt: "Hřiště {venue}",
    surface: {
      turf: "Umělá tráva",
      grass: "Tráva",
      indoor: "Hala",
      sand: "Písek",
    },
    subsPerTeam: "{count} náhradníci na tým",
    skillLevel: {
      beginner: "Začátečník",
      intermediate: "Pokročilý",
      advanced: "Zkušený",
    },
    skillNotEnforced: "Vítáni jsou všichni — je to vodítko, ne pravidlo.",

    organizerLabel: "Pořadatel",

    yourBookingTitle: "Jsi v sestavě",
    yourBookingHeld: "Místo ti držíme — potvrď ho platbou.",
    yourBookingConfirmed: "Zaplaceno. Uvidíme se na hřišti.",
    yourBookingCash: "Platíš hotově na hřišti.",
    yourBookingPay: "Zaplatit za místo",
    yourBookingManage: "Spravovat rezervaci",

    openMapFull: "Otevřít místo v Mapách",
    organizerRole: "Pořádá tento zápas",
    // DRAFT — flagged for the standing native-review batch.
    organizerWhatsApp: "Napsat na WhatsApp",
    organizerWhatsAppMessage: "Ahoj! Dotaz k zápasu {game}.",
    // DRAFT — flagged for the standing native-review batch.
    cardJoinCue: "Hrát",
    availabilityLabel: "Volná místa",
    playersOfCapacity: "{booked} / {capacity} hráčů",
    playersTitle: "Hráči ({count})",
    /*
     * Czech has no possessive apostrophe. "{name} — host {n}" reads as
     * "Karel — guest 2", which is the same fact without inventing a genitive
     * from a free-text nickname the language cannot decline reliably.
     */
    guestOfPlayer: "{name} — host {n}",
    guestNumbered: "Host {n}",
    guestAvatarLabel: "Host",
    gamesPlayed: "{count} zápasů",
    gamePlayedOne: "1 zápas",
    gamesPlayedNone: "První zápas",
    gameInfoTitle: "Informace o zápase",
    infoWhen: "Kdy",
    infoWhere: "Kde",
    infoFormat: "Formát",
    infoLevel: "Úroveň",
    infoDuration: "Délka",
    includedTitle: "Co je v ceně",
    pitchAmenitiesTitle: "Vybavení hřiště",
    amenities: {
      bibs: "Rozlišováky",
      gloves: "Brankářské rukavice",
      balls: "Míče",
      water: "Voda",
      drinks: "Nápoje",
      showers: "Sprchy",
      lockers: "Skříňky",
      parking: "Parkování",
      wifi: "Wi-Fi",
      first_aid: "Lékárnička",
    },
    practicalTitle: "Informace o zápase",
    practicalRotatingKeepers: "Střídání brankářů",
    practicalRotatingSubs: "Střídání náhradníků",
    practicalMeetingPoint: "Kde se sejdeme",
    practicalArrival: "Přijď 10 minut před výkopem.",
    practicalDuration: "Délka",
    practicalDurationValue: "{minutes} minut",

    notesLabel: "Informace o zápase",
    capacityLabel: "Kapacita",
    startsLabel: "Výkop",
    venueLabel: "Kde",
    priceLabel: "Cena",
    alreadyStarted: "Tenhle zápas už začal.",
    inProgress: "Tenhle zápas se právě hraje.",

    urgencyOpen: "Volná místa",
    urgencyLastFew: "Skoro plno",
    urgencyFull: "Plno",

    waitlistTitle: "Fronta",
    waitlistEmpty: "Zatím nikdo nečeká — místo je pořád první ber.",
    waitlistYou: "Ty",
    waitlistCount: "ve frontě",
    onWaitlistBadge: "Čekáš ve frontě",

    nextGameStrip: "Tvůj další zápas",
    nextGameStripCta: "Zobrazit rezervaci →",

    shareWhatsApp: "Sdílet na WhatsAppu",
    shareMessage: "{venue} · {when}\nZaber si místo: {url}",
  },

  booking: {
    claimSpot: "Zaber si místo",
    logInToClaim: "Přihlas se a zaber si místo",
    signInToClaim: "Přihlas se a rezervuj",
    barPaid: "Zaplaceno",
    barAmountDue: "K úhradě {amount}",
    barKickedOffAt: "Začalo v {time}",
    barCancelled: "Zrušeno",
    barOnWaitlist: "Jsi {n}. na čekačce",
    barOnWaitlistNoPosition: "Jsi na čekačce",
    barCancel: "Zrušit",
    barLabel: "Tvoje místo na tomhle zápase",
    nicknameLabel: "Přezdívka",
    nicknameHint: "Písmena, číslice, mezery, _ a - · max. 20 znaků",
    // "QR platba" is the name of the thing in every Czech banking app.
    payByQr: "Zaplatit QR platbou",
    payByQrHint:
      "Naskenuj QR platbu v bankovní aplikaci. Místo ti držíme, dokud platba nedorazí.",
    // DRAFT — flagged for the standing native-review batch.
    // DRAFT — flagged for the standing native-review batch.
    payWithCredit: "Použít kredit",
    payWithCreditHint: "Použije {seats} kredit(ů) z tvé peněženky. Nic neplatíš.",
    payWithCreditNone: "Zatím nemáš žádné kredity.",
    addCredits: "Dobít kredity →",
    payOnline: "Platba online",
    payOnlineHint: "Bezpečně přes Stripe",
    payOnlineComingSoon: "Připravujeme",
    payByCash: "Zaplatit hotově na place",
    payByCashHint: "Vezmi hotovost. Organizátor tě potvrdí na místě.",
    choosePayment: "Jak chceš zaplatit?",
    partyTitle: "Bereš někoho s sebou?",
    partyHint: "Hrají jako tvoji hosté. Jedna rezervace, jedna platba, jedno zrušení.",
    partyJustMe: "Jen já",
    partySummary: "{seats} míst · {total}",
    partyLimited: "Na tomhle hřišti se vejde už jen {n}.",
    partyOnlineQuantity: "Na platební stránce nastav počet na {seats}.",
    awaitingTitle: "Čekáme na tvou platbu",
    awaitingBody:
      "Místo ti držíme {minutes} minut, než platba proběhne. Stránka se sama aktualizuje.",
    awaitingExpiredTitle: "Platba nedorazila",
    awaitingExpiredBody:
      "Platbu jsme včas neviděli, takže se místo vrátilo do zápasu. Pokud je ještě volno, zkus to znovu.",
    awaitingAttentionTitle: "Prověřujeme tvou platbu",
    awaitingAttentionBody:
      "Platba dorazila, ale místo ti nešlo přidělit. Někdo se na to dívá a ozve se ti — neplať znovu.",
    awaitingSeatGone:
      "Zápas se mezitím naplnil, takže není za co platit. Nic jsme ti nestrhli.",
    awaitingRetry: "Zkusit platbu znovu",
    cancelReassuranceKickoff:
      "Zrušit můžeš kdykoli před výkopem — všechno se ti vrátí jako kredit.",
    cancelReassuranceCutoff:
      "Zrušit můžeš až do {hours} h před výkopem — všechno se ti vrátí jako kredit.",
    confirmBooking: "Potvrdit rezervaci",
    bookingConfirmed: "Rezervace potvrzena",
    reserved: "Místo rezervované",
    confirmed: "Platba potvrzená",
    creditApplied: "Kredit uplatněný",
    amountDue: "K úhradě",
    // DRAFTS — flagged for native review with the slogan pair.
    notEnoughCreditsTitle: "Nemáš dost kreditů",
    notEnoughCreditsBody:
      "Zápas stojí 1 kredit. Pořiď si permanentku a ušetři až {percent} %, nebo zaplať tenhle přes QR.",
    getCredits: "Získat kredity",
    payByQrThisGame: "Zaplatit tenhle zápas přes QR",
    cancelBooking: "Zrušit rezervaci",
    cancelTitle: "Zrušit rezervaci?",
    cancelKeep: "Nechat si místo",
    cancelFailed: "Zrušení se nepovedlo. Rezervaci máš pořád.",
    refundToWallet: "Co jsi zaplatil, se ti vrátí jako kredit do peněženky.",
    // DRAFT — flagged for the standing native-review batch.
    refundLostLate:
      "Do výkopu zbývá méně než {hours} hodin, takže se ti tenhle zápas nevrátí do kreditu. Zrušením ale uvolníš místo pro někoho dalšího.",
    cancelConfirm: "Zrušit tuhle rezervaci? Kredit se ti vrátí do peněženky.",
    cancelled: "Rezervace zrušená",
    addToCalendar: "Přidat do kalendáře",
    share: "Sdílet",
    coveredByCredit: "Tvůj kredit pokryl celý zápas. Nic neplatíš.",
    coveredBySeed: "Jsi v sestavě. Za tenhle zápas nic neplatíš.",
    backToGame: "← Zpět na zápas",
    bookingNotFound: "Takovou rezervaci jsme nenašli.",
  },

  payment: {
    qrTitle: "Naskenuj a zaplať",
    qrHint: "Otevři bankovní aplikaci a naskenuj QR platbu. Platba se označí sama.",
    account: "Účet",
    variableSymbol: "Variabilní symbol (VS)",
    amount: "Částka",
    paidAlready: "Zaplatil jsem",
    pendingConfirmation: "Čekáme, až organizátor potvrdí tvoji platbu.",

    // Round 15, item 1 — DRAFT, for the native-review batch.
    returnTitle: "Potvrzujeme platbu",
    confirmingTitle: "Potvrzujeme tvoji platbu…",
    confirmingBody:
      "Stripe má tvoji platbu. Čekáme, až k nám dorazí potvrzení — obvykle to trvá pár vteřin.",
    slowTitle: "Stále zpracováváme",
    slowBookingBody:
      "Stripe tvoji platbu přijal a zpracovává ji. Rezervaci potvrdíme během chvilky — znovu platit nemusíš.",
    slowPassBody:
      "Stripe tvoji platbu přijal a zpracovává ji. Kredity se objeví během chvilky — znovu platit nemusíš.",
    slowBackToGame: "Zpět na zápas",
    slowBackToGames: "Zpět na zápasy",
    returnUnknownTitle: "Není co potvrzovat",
    returnUnknownBody:
      "K tomuto účtu nečeká žádná platba. Pokud jsi právě zaplatil a tohle se opakuje, své zápasy a kredity najdeš v profilu.",
  },

  profile: {
    editDetails: "Upravit údaje",
    saveProfile: "Uložit profil",
    cancelEdit: "Zrušit",
    displayName: "Zobrazované jméno",
    position: "Preferovaný post",
    positionHint: "Vyber všechny, na kterých hraješ.",
    skillLevel: "Úroveň",
    nationality: "Národnost",
    phone: "Telefon",
    phoneHint: "Vidí ho jen organizátor zápasu, který máš zarezervovaný.",
    email: "E-mail",
    emailChangeHint: "Zavři formulář a e-mail změníš u adresy výše.",
    notSet: "Nevyplněno",
    saved: "Profil uložen",
    saveFailed: "Uložení se nepovedlo. Zkus to prosím znovu.",
    positions: {
      gk: "Brankář",
      def: "Obránce",
      mid: "Záložník",
      att: "Útočník",
    },

    // DRAFT — flagged for the standing native-review batch.
    memberSince: "od {date}",

    tabOverview: "Přehled",
    tabGames: "Moje zápasy",

    statGamesOne: "odehraný zápas",
    statGamesFew: "odehrané zápasy",
    statGamesMany: "odehraných zápasů",
    statHoursOne: "hodina na hřišti",
    statHoursFew: "hodiny na hřišti",
    statHoursMany: "hodin na hřišti",
    statVenuesOne: "hřiště",
    statVenuesFew: "hřiště",
    statVenuesMany: "hřišť",

    badgesTitle: "Odznaky",
    badgesCount: "{earned} z {total}",

    badges: {
      firstGame: "První zápas",
      firstGameHint: "Odehraj jeden zápas",
      regular: "Stálice",
      regularHint: "Odehraj 5 zápasů",
      veteran: "Veterán",
      veteranHint: "Odehraj 20 zápasů",
      explorer: "Průzkumník",
      explorerHint: "Zahraj si na 3 různých hřištích",
      ironLegs: "Železné nohy",
      ironLegsHint: "Stráv na hřišti 10 hodin",
    },
  },

  account: {
    myGamesTitle: "Moje zápasy",
    myGamesLink: "Zobrazit všechny moje zápasy →",
    myGamesEmpty:
      "Zatím sis nezabral místo. Vyber zápas z nástěnky a objeví se tady.",
    myGamesEmptyCta: "Najdi zápas →",
    title: "Můj účet",
    myBookings: "Moje rezervace",
    noBookings: "Zatím žádné rezervace.",
    noBookingsTitle: "Tvoje sestava je prázdná",
    noBookingsBody:
      "Zaber si místo v jakémkoli zápase a objeví se tady i s QR platbou.",
    findAGame: "Najít zápas →",
    creditBalance: "Kredit",
    creditEmpty: "Zatím žádný kredit.",
    showQr: "Zobrazit QR platbu",
    creditHint: "Kredit se automaticky uplatní u další rezervace.",
    historyTitle: "Tvoje historie",
    gamesPlayedLabel: "Odehrané zápasy",
    noShowsLabel: "Neúčasti",
    upcomingTitle: "Nadcházející",
    // Round 16 item 12 — DRAFT.
    waitlistTitle: "Čekací listina",
    pastTitle: "Už odehrané",
    pastEmpty: "Zatím nic odehraného — první zápas se objeví tady.",
    attendancePresent: "Dorazil",
    attendanceNoShow: "Nedorazil",

    topupTitle: "Dobij si peněženku",
    topupLede: "Přidej si kredit teď a na další rezervaci se použije automaticky.",
    topupCta: "Získat permanentku",
    topupAmountLabel: "Částka",
    topupCustomLabel: "Nebo jiná částka (Kč)",
    topupSubmit: "Zobrazit platební QR",
    topupOutOfRange: "Zvol částku mezi 50 a 2000 Kč.",
    topupPendingTitle: "Čekáme na tvoji platbu",
    topupPendingBody:
      "Naskenuj kód v bankovní aplikaci. Peněženka se aktualizuje, jakmile organizátor potvrdí, že platba dorazila.",
    topupConfirmedTitle: "Tohle dobití už máš v peněžence.",
    topupBackToAccount: "← Zpět na můj účet",

    photoTitle: "Profilová fotka",
    coverChange: "Změnit pozadí",
    photoUpload: "Nahrát fotku",
    photoReplace: "Vyměnit fotku",
    photoBadType: "Použij JPG, PNG nebo WebP.",
    photoTooBig: "Obrázek má přes 2 MB. Vyber menší.",
    photoUploadFailed: "Fotka se nenahrála. Zkus to znovu.",
    photoUploading: "Nahrávám fotku…",

    securityTitle: "Přihlášení a zabezpečení",

    changePasswordTitle: "Změnit heslo",
    currentPasswordLabel: "Současné heslo",
    newPasswordLabel: "Nové heslo",
    changePasswordSubmit: "Změnit heslo",
    changePasswordDone: "Heslo změněno.",
    currentPasswordWrong:
      "Tohle není tvoje současné heslo. Pokud sis žádné nenastavil, odhlas se a použij kód z e-mailu.",

    changeEmailTitle: "Změnit e-mail",
    newEmailLabel: "Nový e-mail",
    changeEmailSubmit: "Poslat potvrzení",
    changeEmailHint:
      "Potvrzení pošleme na tvou současnou i na novou adresu. E-mail se změní, až potvrdíš obě.",
    changeEmailSent:
      "Poslali jsme dvě potvrzení — jedno na {current}, druhé na {next}. Otevři obě.",
    changeEmailSame: "Tuhle adresu už používáš.",
    changeEmailFailed: "Změnu e-mailu se nepodařilo spustit. Zkus to prosím znovu.",

    changePasswordLink: "Změnit heslo",
    changeEmailLink: "Změnit e-mail",
    deleteAccount: "Smazat účet",
    deleteAccountHint: "Napiš nám a tvoje data smažeme.",
    deleteSubject: "Žádost o smazání účtu",
    badgePaid: "Zaplaceno",
    badgeReserved: "Čeká na platbu",
    badgeCash: "Hotově na place",
    badgeSeed: "Zdarma",
    badgeCancelled: "Zrušeno",
    badgeExpired: "Propadlo",
    past: "Odehrané",
    upcoming: "Nadcházející",
    cancelSuccess: "Rezervace zrušená. Kredit je zpátky v peněžence.",
  },

  errors: {
    generic: "Něco se pokazilo. Zkus to prosím znovu.",
    partyTooLarge: "Tolik hostů se na jednu rezervaci nevejde.",
    passNotConfigured: "Tahle permanentka zatím není v prodeji.",
    capacityFull: "Tohle místo ti někdo vyfoukl, než ses rozhodl.",
    capacityFullTitle: "Místo je pryč",
    duplicateActiveBooking: "V tomhle zápase už místo máš.",
    duplicateActiveBookingTitle: "Rezervaci už máš",
    creditNegativeBlocked: "Na tuhle rezervaci nemáš dost kreditu.",
    insufficientPermission: "Na tohle nemáš oprávnění.",
    cancelWindowClosed: "Na zrušení téhle rezervace už je pozdě.",
    notSignedIn: "Nejdřív se přihlas.",
    gameNotWaitlistable: "Tenhle zápas frontu nepřijímá.",
    capacityFullWaitlist: "Místo dostal někdo jiný. Ve frontě na další zůstáváš.",
    gameNotBookable: "Tenhle zápas není otevřený k rezervaci.",
    gameAlreadyStarted: "Tenhle zápas už začal.",
    tryAgain: "Zkusit znovu",
  },

  pass: {
    title: "Herní permanentka",
    lede: "Předplať si zápasy se slevou. Přistane ti v peněžence jako kredit a sám se použije na další rezervaci.",
    // The product name stays English in every locale — see lib/strings.ts.
    panelTitle: "Game Pass",
    panelBody: "Předplať si zápasy se slevou",
    creditsOne: "{n} kredit",
    creditsFew: "{n} kredity",
    creditsMany: "{n} kreditů",
    creditEqualsGame: "1 kredit = 1 zápas",

    // Round 15, item 2 — DRAFT. `{credits}` je celá fráze včetně tvaru
    // podstatného jména ("1 kredit" / "3 kredity" / "12 kreditů"), takže věta
    // kolem něj se nesmí snažit shodovat s číslem.
    creditsAddedTitle: "Kredity byly přidány",
    creditsAddedCount: "Teď máš {credits}.",
    creditsAddedBack: "Zpět na zápasy",
    tierPerGame: "{amount} za zápas",
    tierSaving: "Ušetříš {amount}",
    tierExpiresDays: "Platí {days} dní od připsání platby",
    tierNeverExpires: "Bez expirace",
    tierBuy: "Koupit permanentku",
    tierPurchase: "Koupit",
    tierMostPopular: "Nejoblíbenější",
    equivalence: "≈ {count} zápasů",
    howItWorks: "Jak to funguje",
    howItWorksBody:
      "Zaplatíš kartou nebo mobilní peněženkou. Jakmile je platba potvrzená, kredity se ti automaticky připíšou na účet.",
    batchesTitle: "Tvůj kredit",
    batchesExpiring: "Zbývá {credits} · vyprší {date}",
    batchesNever: "{credits} · bez expirace",
    paymentsSoon: "Platby brzy spustíme.",
    tryThePass: "Nebo zkus Game Pass →",
    batchesNone: "Žádný kredit s expirací.",
  },

  toast: {
    bookingCreated: "Jsi v sestavě. Místo ti držíme.",
    signedIn: "Přihlášeno.",
    bookingCancelled: "Zrušeno — hodnota se ti vrátila do peněženky jako kredit.",
    topupConfirmed: "Dobití potvrzeno. Zůstatek je aktualizovaný.",
    linkCopied: "Odkaz zkopírován.",
    failed: "Neprošlo to. Zkus to znovu.",
  },

  notifications: {
    // Round 16 item 13 — DRAFT.
    clearAll: "Smazat vše",
    // DRAFT — flagged for the standing native-review batch.
    bellLabel: "Oznámení",
    title: "Oznámení",
    empty: "Zatím nic.",
  },

  common: {
    back: "Zpět",
    close: "Zavřít",
    dismiss: "Zavřít oznámení",
    loading: "Načítání…",
    // `czk` is NOT translated. `formatCzk()` renders "200 CZK" in every
    // language on purpose — see the header note.
  },

  /**
   * Oliver's Czech, delivered 2026-08-01, marked by him as a draft for a native
   * pass. Shipped as given: the English is the source, this is the translation,
   * and a session rewriting either would be inventing copy.
   */
  faq: {
    title: "Otázky",
    items: [
      {
        q: "Co si mám vzít?",
        a: "Boty a sebe. Rozlišováky, brankářské rukavice i míče jsou zajištěny.",
      },
      {
        q: "Jak zaplatím?",
        a: "Kartou nebo mobilní peněženkou při rezervaci, kredity z permanentky, nebo hotově na hřišti.",
      },
      {
        q: "Co když je zápas plný?",
        a: "Přidej se na čekací listinu. Jakmile se místo uvolní, pošleme e-mail všem na ní — a místo dostane ten, kdo si ho vezme první.",
      },
      {
        q: "Musím být dobrý?",
        a: "Všechny úrovně jsou vítány; zápasy jsou přátelské, pokud u zápasu není uvedena konkrétní úroveň.",
      },
    ],
  },
};
