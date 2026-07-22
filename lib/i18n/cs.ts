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
    profile: "Můj profil",
    home: "Hraj Fotbal — domů",
  },

  siteFooter: {
    privacy: "Soukromí",
    contact: "Kontakt",
  },

  notFound: {
    title: "Tady nic není",
    body: "Tenhle odkaz míří na stránku, která neexistuje — nebo na zápas, který už dávno skončil.",
    cta: "Mrkni, co se hraje →",
  },

  landing: {
    heroSub: "Přidej se a užij si to.",
    vision: "Jeden zápas, který se opakuje. Najdi hru, zaber si místo, přijď.",
    heroCta: "Najít zápas →",
    scrollHint: "↓ SCROLLUJ",
    steps: [
      { index: "01", title: "NAJDI ZÁPAS", body: "Zápasy kousek od tebe, každý týden." },
      {
        index: "02",
        title: "ZABER SI MÍSTO",
        body: "Zadej přezdívku a jsi v sestavě.",
      },
      { index: "03", title: "PŘIJĎ A HRAJ", body: "Zaplať předem z mobilu. Hotovo." },
    ],
    nextMatchLabel: "PŘÍŠTÍ ZÁPAS",
    nextMatchCta: "Zaber si místo",
    community: {
      title: "PŘIDEJ SE K PARTĚ",
      body: "Nové zápasy každý týden. Sleduj a hraj.",
      whatsapp: "WHATSAPP SKUPINA",
    },
    footer: {
      city: "· PRAHA",
      tagline: "PŘIJĎ KVŮLI HŘE · ZŮSTAŇ KVŮLI PARTĚ",
    },
  },

  auth: {
    loginTitle: "Přihlášení",
    loginLede: "Pošleme ti odkaz e-mailem. Žádné heslo si pamatovat nemusíš.",
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

    signupTitle: "Vyber si přezdívku",
    signupLede: "Pod tímhle jménem budeš v sestavě.",
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
    emptyTitle: "Zatím nic na programu",
    emptyBody:
      "Další zápas se obvykle objeví pár dní dopředu. Přidej se do WhatsApp skupiny a dozvíš se to první.",
    emptyCta: "Přidat se do WhatsApp skupiny →",
    spotsLeft: "volných míst",
    spotLeft: "volné místo",
    full: "Plno",
    joinWaitlist: "Přidat se do fronty",
    fullNotice: "Zápas je plný — všechna místa jsou zabraná.",
    seeOtherGames: "Další zápasy →",
    onWaitlist: "Jsi ve frontě",
    waitlistJoined: "Jsi ve frontě. Napíšeme ti, jakmile se místo uvolní.",
    waitlistAlready: "Ve frontě na tenhle zápas už jsi.",
    waitlistHint:
      "Jakmile se místo uvolní, dozvědí se to všichni ve frontě naráz — dostane ho ten, kdo si ho zabere první.",
    waitlistPosition: "Jsi #{position} ve frontě",
    waitlistConvertTitle: "Zaber uvolněné místo",
    waitlistConvertHint: "Vyber, jak chceš zaplatit, a místo je tvoje.",
    waitlistNotOnList: "Ve frontě na tenhle zápas nejsi.",
    rosterTitle: "Sestava",
    rosterEmpty: "Zatím nikdo v sestavě — buď první.",
    cancelled: "Tenhle zápas byl zrušený.",
    notFound: "Takový zápas neexistuje, nebo ještě není zveřejněný.",
    backToGames: "← Všechny zápasy",
    viewGame: "Zobrazit zápas",
    rosterReserved: "drží místo",
    rosterConfirmed: "v sestavě",
    filledLabel: "OBSAZENO",
    joinNote: "Jedno ťuknutí a máš místo. Zaplať předem z mobilu.",
    openMap: "OTEVŘÍT MAPU ↗",
    mapAlt: "Mapa místa",
    surface: {
      turf: "Umělá tráva",
      grass: "Tráva",
      indoor: "Hala",
      sand: "Písek",
    },
    notesLabel: "Dobré vědět",
    capacityLabel: "Kapacita",
    startsLabel: "Výkop",
    venueLabel: "Kde",
    priceLabel: "Cena",
    alreadyStarted: "Tenhle zápas už začal.",

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
    nicknameLabel: "Přezdívka",
    nicknameHint: "Písmena, číslice, mezery, _ a - · max. 20 znaků",
    // "QR platba" is the name of the thing in every Czech banking app.
    payByQr: "Zaplatit QR platbou",
    payByQrHint:
      "Naskenuj QR platbu v bankovní aplikaci. Místo ti držíme, dokud platba nedorazí.",
    payByCash: "Zaplatit hotově na place",
    payByCashHint: "Vezmi hotovost. Organizátor tě potvrdí na místě.",
    choosePayment: "Jak chceš zaplatit?",
    cancelReassuranceKickoff:
      "Zrušit můžeš kdykoli před výkopem — všechno se ti vrátí jako kredit.",
    cancelReassuranceCutoff:
      "Zrušit můžeš až do {hours} h před výkopem — všechno se ti vrátí jako kredit.",
    confirmBooking: "Potvrdit rezervaci",
    reserved: "Místo rezervované",
    confirmed: "Platba potvrzená",
    creditApplied: "Kredit uplatněný",
    amountDue: "K úhradě",
    cancelBooking: "Zrušit rezervaci",
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
  },

  account: {
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

  common: {
    back: "Zpět",
    close: "Zavřít",
    loading: "Načítání…",
    // `czk` is NOT translated. `formatCzk()` renders "200 CZK" in every
    // language on purpose — see the header note.
  },
};
