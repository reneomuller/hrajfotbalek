import type { StringsOverlay } from "@/lib/i18n/resolve";

/**
 * Ukrainian (round 22).
 *
 * Player-facing copy only, same scope as the Czech and Russian overlays — the
 * admin panel, the email templates and the privacy page stay English. See
 * `lib/i18n/locales.ts`.
 *
 * EVERY STRING IN THIS FILE IS A DRAFT. It is a machine translation made from
 * the English source, not from the Russian, so it is a translation of the
 * original rather than a translation of a translation — Ukrainian and Russian
 * are close enough that going through Russian would import its word choices
 * along with its grammar, and some of those choices are wrong here
 * (`матч` vs `гра`, `кошелёк` vs `гаманець`). No Ukrainian speaker has read
 * any of it. The whole file is on the standing native-review batch; individual
 * `DRAFT` comments are therefore NOT repeated line by line the way they are in
 * `cs.ts` and `ru.ts`, because a flag on every line is a flag on none.
 *
 * WHY UKRAINIAN IS NOT A DIALECT OF THE RUSSIAN FILE. The two look similar in
 * a diff and are not: the vocative and the apostrophe rules differ, `и`/`і`
 * are different letters, and — the part that reaches the code — the CLDR
 * plural boundaries, while the same SHAPE as Russian, are selected by
 * `Intl.PluralRules("uk")` and nothing here assumes they match.
 *
 * THE PAYMENT VOCABULARY STAYS CZECH, exactly as in the Russian overlay and
 * for exactly the same reason. A Ukrainian-speaking player in Prague pays from
 * a Czech bank account: the screen they are about to open says "variabilní
 * symbol" and offers a "QR platba", and the amount is in CZK. A translated
 * reference field is a payment that arrives unmatched.
 *
 * Register: "ти", matching the familiar tone of the English, Czech and
 * Russian.
 */
export const uk: StringsOverlay = {
  meta: {
    title: "Hraj Fotbal — футбол без зобов’язань у Празі",
    description: "Один матч, що повторюється. Знайди гру, займи місце, приходь.",
  },

  nav: {
    cta: "Зайняти місце",
    games: "Матчі",
    logIn: "Увійти",
    homeShort: "Головна",
    pass: "Абонемент",
    myGames: "Мої матчі",
    profileShort: "Профіль",
    primary: "Головна навігація",
    profile: "Мій профіль",
    home: "Hraj Fotbal — на головну",
  },

  siteFooter: {
    privacy: "Приватність",
    terms: "Умови",
    contact: "Контакт",
    contactTitle: "Зв’яжися з нами",
  },

  notFound: {
    title: "Тут нічого немає",
    body: "Це посилання веде на сторінку, якої не існує — або на матч, який уже давно зіграно.",
    cta: "Подивитися, що граємо →",
  },

  landing: {
    // Split at the first sentence; the period after line one is drawn in volt
    // by the component, so it is not in the string.
    heroLine1: "Грай у футбол",
    heroLine2: "Коли завгодно. Де завгодно.",
    vision: "Один матч, що повторюється. Знайди гру, займи місце, приходь.",
    scrollHint: "↓ ГОРТАЙ",
    steps: [
      { index: "01", title: "Знайди матч", body: "Ігри поруч із тобою, щотижня." },
      {
        index: "02",
        title: "Займи місце",
        body: "Забронюй місце, сплативши внесок. Решта — на нас.",
      },
      {
        index: "03",
        title: "Приходь і грай",
        body: "Приходь на поле і насолоджуйся грою",
      },
    ],
    statsGamesLabel: "Матчів щотижня",
    statsPlayersLabel: "Активних гравців",
    nextMatchesLabel: "Найближчі матчі",
    nextMatchesAll: "Усі матчі →",
    potmTitle: "Гравець місяця",
    potmEmpty: "Поки нікого — може, це будеш ти.",
    potmHours: "{hours} год на полі цього місяця",
    community: {
      title: "Приєднуйся до нас",
      body: "Підписуйся на наші соцмережі, щоб бути в курсі новин спільноти",
    },
    footer: {
      city: "· ПРАГА",
    },
  },

  auth: {
    loginTitle: "Вхід",
    loginLede: "Пошта і пароль. Пароля ще немає? Скористайся посиланням для скидання.",
    signInSubmit: "Увійти",
    invalidCredentials: "Пошта і пароль не збігаються.",
    emailNotConfirmed:
      "Спершу підтверди пошту — відкрий посилання, яке ми надіслали під час реєстрації.",

    forgotPasswordLink: "Забули пароль?",
    resetTitle: "Скидання пароля",
    resetLede: "Надішлемо на пошту шестизначний код. Введи його тут і задай новий пароль.",
    resetBackToLogin: "← Назад до входу",
    forgotPasswordLead: "Забув пароль або ще не задавав його?",
    forgotPasswordCta: "Надіслати код",

    setPasswordTitle: "Задай пароль",
    setPasswordLede: "Ти увійшов. Обери пароль — і наступного разу пошта не знадобиться.",
    setPasswordSubmit: "Зберегти пароль",
    setPasswordSkip: "Не зараз — залишуся на коді",
    setPasswordFailed: "Не вдалося зберегти пароль. Спробуй ще раз.",
    emailLabel: "Пошта",
    sendLink: "Надіслати посилання",
    linkSent: "Загляни в пошту — посилання вже летить.",
    otpLead: "Або введи 6-значний код із листа:",
    otpLabel: "6-значний код",
    otpSubmit: "Увійти",
    otpInvalid: "Код неправильний або протермінований. Запроси новий.",
    otpMalformed: "У коді шість цифр.",
    linkExpired: "Термін дії посилання минув. Запроси нове.",
    signOut: "Вийти",
    emailInvalid: "Це не схоже на адресу електронної пошти.",
    linkSendFailed: "Не вдалося надіслати посилання. Спробуй ще раз.",
    callbackFailed: "Це посилання для входу недійсне або вже використане.",
    callbackErrorTitle: "Увійти не вдалося",
    callbackRetry: "Запросити нове посилання",
    callbackDetailLabel: "Технічні деталі",

    signupTitle: "Створи акаунт",
    signupLede: "Один акаунт, один нік — і ти у складі.",
    signupFinishTitle: "Заверши профіль",
    signupFinishLede: "Пошту підтверджено. Лишився останній крок.",

    passwordLabel: "Пароль",
    passwordHint: "Щонайменше 8 символів",
    passwordTooShort: "Потрібно щонайменше 8 символів.",

    countryLabel: "Країна",
    countryPlaceholder: "Обери країну",
    countryInvalid: "Обери, будь ласка, країну зі списку.",

    skillLabel: "Як ти граєш?",
    skillHint: "Показується у профілі. Бронювати гру це ніколи не заважає.",
    skillBeginner: "Початківець",
    skillIntermediate: "Середній рівень",
    skillAdvanced: "Досвідчений",
    skillRequired: "Обери, будь ласка, рівень.",

    phoneLabel: "Телефон",
    phoneRequired: "Потрібен телефон, щоб організатор міг зв’язатися з тобою щодо гри.",
    phoneInvalid: "Номер телефону — від 3 до 32 символів.",
    phoneHint: "Його бачить лише організатор і лише щодо ігор, які ти забронював.",

    legalGroupLabel: "Перед початком",
    tosLabel: "Я приймаю умови обслуговування.",
    tosLink: "Читати умови",
    tosRequired: "Щоб продовжити, прийми умови.",
    preferencesGroupLabel: "Необов’язково",

    emailTaken:
      "Акаунт із такою поштою вже є. Увійди — або скористайся кодом, якщо пароля ще немає.",
    signupFailed: "Не вдалося створити акаунт. Спробуй ще раз.",

    verifyTitle: "Підтверди пошту",
    verifyBody:
      "Ми надіслали посилання на {email}. Відкрий його — і акаунт готовий; посилання працює на будь-якому пристрої.",
    verifyHint: "Листа немає кілька хвилин? Перевір спам і спробуй знову.",

    signUp: "Реєстрація",
    noAccountLead: "Ще не з нами?",
    createAccountCta: "Реєстрація →",
    haveAccount: "Уже є акаунт?",
    googleContinue: "Продовжити через Google",
    googleSignUp: "Реєстрація через Google",
    googleFailed: "Не вдалося почати вхід через Google. Спробуй ще раз.",
    authOr: "або",
    noAccount: "Уперше тут?",
    nicknameLabel: "Нік",
    nicknameHint: "Літери, цифри, пробіли, _ і - · до 20 символів",
    nicknameInvalid: "Лише літери, цифри, пробіли, _ і - (до 20 символів).",
    nicknameTaken: "Такий нік уже зайнятий. Спробуй інший.",
    gdprLabel: "Я погоджуюся з політикою конфіденційності.",
    gdprLink: "Читати політику конфіденційності",
    gdprRequired: "Без згоди з політикою продовжити не вийде.",
    marketingLabel: "Надсилайте листи про нові матчі. (Необов’язково)",
    createAccount: "Створити акаунт",
  },

  games: {
    listTitle: "Найближчі матчі",
    empty: "Поки немає жодного матчу.",
    emptyTitle: "Ігор поки немає",
    emptyBody: "Нові ігри з’являються щотижня.",
    emptyCta: "Приєднуйся до групи WhatsApp",
    spotsLeftOne: "{n} місце вільне",
    spotsLeftFew: "{n} місця вільні",
    spotsLeftMany: "{n} місць вільно",
    full: "Місць немає",
    durationMin: "{n} хв",
    past: "Завершено",
    joinWaitlist: "Стати в чергу",
    fullNotice: "Матч заповнений — усі місця зайняті.",
    seeOtherGames: "Інші матчі →",
    onWaitlist: "Ти в черзі",
    waitlistJoined: "Ти в черзі. Напишемо, щойно звільниться місце.",
    waitlistAlready: "Ти вже в черзі на цей матч.",
    waitlistLeave: "Вийти з черги",
    waitlistLeftDone: "Ти вийшов із черги.",
    waitlistHint:
      "Щойно місце звільниться, про це дізнаються всі в черзі одночасно — місце дістанеться тому, хто займе його першим.",
    waitlistPosition: "Ти #{position} у черзі",
    waitlistConvertTitle: "Зайняти вільне місце",
    waitlistConvertHint: "Обери, як платиш, і місце твоє.",
    waitlistNotOnList: "Тебе немає в черзі на цей матч.",
    waitlistJoinedTitle: "Ти в черзі",
    waitlistSpotOpenTitle: "Місце звільнилося",
    waitlistSpotOpenBody: "Усі в черзі дізналися одночасно. Займи його — і воно твоє.",
    waitlistNotOnListTitle: "Тебе немає в цій черзі",
    waitlistNotOnListBody:
      "Можливо, місце вже зайняли, або ти записався на інший матч.",
    waitlistSeeGame: "Відкрити матч",
    rosterTitle: "Склад",
    rosterEmpty: "Поки ніхто не зайняв місце",
    cancelled: "Цей матч скасовано.",
    notFound: "Такого матчу немає або він ще не опублікований.",
    backToGames: "← Усі матчі",
    viewGame: "Відкрити матч",
    copyLink: "Копіювати посилання",
    copyLinkFailed: "Не вдалося скопіювати — затисни адресний рядок.",
    dayFilterAll: "Усі",
    dayToday: "Сьогодні",
    dayTomorrow: "Завтра",
    dayTomorrowShort: "Завтра",
    rosterReserved: "тримає місце",
    rosterConfirmed: "у складі",
    filledLabel: "ЗАЙНЯТО",
    joinNote: "Один дотик — і місце твоє. Заплати заздалегідь із телефона.",
    openMap: "ВІДКРИТИ КАРТУ ↗",
    mapAlt: "Карта майданчика",
    venuePhotoAlt: "Поле {venue}",
    surface: {
      turf: "Штучний газон",
      grass: "Трава",
      indoor: "Зал",
      sand: "Пісок",
    },
    subsPerTeamOne: "{n} запасний на команду",
    subsPerTeamFew: "{n} запасні на команду",
    subsPerTeamMany: "{n} запасних на команду",
    skillLevel: {
      beginner: "Новачок",
      intermediate: "Середній",
      advanced: "Досвідчений",
    },
    skillNotEnforced: "Раді всім — це орієнтир, а не правило.",

    organizerLabel: "Організатор",

    yourBookingTitle: "Ти у складі",
    yourBookingHeld: "Місце заброньовано — підтверди його оплатою.",
    yourBookingConfirmed: "Оплачено. Побачимося на полі.",
    yourBookingCash: "Платиш готівкою на полі.",
    yourBookingPay: "Оплатити місце",
    yourBookingManage: "Керувати бронюванням",

    openMapFull: "Відкрити місце на карті",
    organizerRole: "Організовує цей матч",
    organizerTelegram: "Написати в Telegram",
    organizerWhatsApp: "Написати у WhatsApp",
    organizerWhatsAppMessage: "Привіт! Питання щодо гри {game}.",
    cardJoinCue: "Граю",
    availabilityLabel: "Вільні місця",
    playersOfCapacity: "{booked} / {capacity} гравців",
    playersTitle: "Гравці ({count})",
    /*
     * Ukrainian forms a possessive by declining the name, which cannot be done
     * safely to a free-text nickname — the same reason the Russian overlay
     * gives. The dash keeps the relationship without asserting a grammatical
     * case the nickname may not have.
     */
    guestOfPlayer: "{name} — гість {n}",
    guestNumbered: "Гість {n}",
    guestAvatarLabel: "Гість",
    gamesPlayedOne: "{n} матч",
    gamesPlayedFew: "{n} матчі",
    gamesPlayedMany: "{n} матчів",
    gamesPlayedNone: "Перший матч",
    gameInfoTitle: "Інформація про гру",
    infoWhen: "Коли",
    infoWhere: "Де",
    infoFormat: "Формат",
    infoLevel: "Рівень",
    infoDuration: "Тривалість",
    infoLanguage: "Мова",
    infoSurface: "Покриття",
    includedTitle: "Що входить",
    pitchAmenitiesTitle: "Інфраструктура майданчика",
    amenities: {
      bibs: "Манішки",
      gloves: "Воротарські рукавиці",
      balls: "М’ячі",
      water: "Вода",
      drinks: "Напої",
      showers: "Душові",
      lockers: "Шафки",
      parking: "Паркування",
      wifi: "Wi-Fi",
      first_aid: "Аптечка",
    },
    practicalTitle: "Інформація про гру",
    practicalMeetingPoint: "Місце зустрічі",
    practicalArrival: "Приходь за 10 хвилин до початку.",
    practicalDuration: "Тривалість",
    practicalDurationValue: "{minutes} хвилин",
    notesLabel: "Нотатки від організатора",
    capacityLabel: "Місткість",
    startsLabel: "Початок",
    venueLabel: "Де",
    priceLabel: "Ціна",
    alreadyStarted: "Цей матч уже почався.",
    inProgress: "Цей матч триває просто зараз.",

    urgencyOpen: "Є місця",
    urgencyLastFew: "Майже заповнений",
    urgencyFull: "Місць немає",

    waitlistTitle: "Черга",
    waitlistEmpty: "Поки ніхто не чекає — місце все ще дістається першому.",
    waitlistYou: "Ти",
    waitlistCount: "у черзі",
    onWaitlistBadge: "Ти в черзі",

    nextGameStrip: "Твій наступний матч",
    nextGameStripCta: "Відкрити бронювання →",

    shareWhatsApp: "Поділитися у WhatsApp",
    shareMessage: "{venue} · {when}\nЗайми місце: {url}",
  },

  booking: {
    claimSpot: "Зайняти місце",
    logInToClaim: "Увійди, щоб зайняти місце",
    signInToClaim: "Увійди, щоб забронювати",
    barPaid: "Оплачено",
    barAmountDue: "До сплати {amount}",
    barKickedOffAt: "Початок о {time}",
    barCancelled: "Скасовано",
    barOnWaitlist: "Ти {n}-й у черзі",
    barOnWaitlistNoPosition: "Ти в черзі",
    barCancel: "Скасувати",
    barLabel: "Твоє місце на цьому матчі",
    nicknameLabel: "Нік",
    nicknameHint: "Літери, цифри, пробіли, _ і - · до 20 символів",
    // "QR platba" — the Czech banking app's own name for it, kept and glossed.
    payByQr: "Оплатити через QR (QR platba)",
    payByQrHint:
      "Відскануй QR у банківському застосунку. Місце тримаємо за тобою, поки не надійде платіж.",
    payWithCredit: "Списати кредит",
    payWithCreditHint: "Спишеться {seats} кредит(ів) із гаманця. Платити нічого не потрібно.",
    payWithCreditNone: "У тебе поки немає кредитів.",
    addCredits: "Поповнити кредити →",
    payOnline: "Онлайн-оплата",
    payOnlineHint: "Безпечно через Stripe",
    payOnlineComingSoon: "Скоро",
    payByCashHint: "Цю броню ти закриваєш з організатором на полі.",
    choosePayment: "Як платитимеш?",
    partyTitle: "Береш когось із собою?",
    partyHint: "Вони грають як твої гості. Одне бронювання, одна оплата, одне скасування.",
    partyJustMe: "Тільки я",
    partySeatsOne: "{n} місце",
    partySeatsFew: "{n} місця",
    partySeatsMany: "{n} місць",
    partyLimited: "На це поле поміститься ще тільки {n}.",
    partyOnlineQuantity: "На сторінці оплати вкажи кількість {seats}.",
    awaitingTitle: "Чекаємо на твою оплату",
    awaitingBody:
      "Місце тримаємо {minutes} хвилин, поки триває платіж. Сторінка оновиться сама.",
    awaitingExpiredTitle: "Платіж не надійшов",
    awaitingExpiredBody:
      "Ми не побачили оплату вчасно, і місце повернулося в гру. Якщо ще є місця, спробуй знову.",
    awaitingAttentionTitle: "Перевіряємо твій платіж",
    awaitingAttentionBody:
      "Платіж надійшов, але місце видати не вдалося. Ми вже розбираємося і зв’яжемося з тобою — не плати ще раз.",
    awaitingSeatGone:
      "Поки тебе не було, гра заповнилася, тож платити нема за що. Нічого не списано.",
    awaitingRetry: "Повторити оплату",
    cancelReassuranceKickoff:
      "Скасувати можна будь-коли до початку — усе повернеться кредитом у гаманець.",
    cancelReassuranceCutoff:
      "Скасувати можна за {hours} год до початку — усе повернеться кредитом у гаманець.",
    confirmBooking: "Підтвердити бронювання",
    bookingConfirmed: "Бронювання підтверджено",
    reserved: "Місце заброньовано",
    confirmed: "Платіж підтверджено",
    creditApplied: "Кредит застосовано",
    amountDue: "До сплати",
    notEnoughCreditsTitle: "Кредитів не вистачає",
    notEnoughCreditsBody:
      "Гра коштує 1 кредит. Візьми абонемент і заощадь до {percent} %, або оплати цю гру через QR.",
    getCredits: "Отримати кредити",
    payByQrThisGame: "Оплатити цю гру через QR",
    cancelBooking: "Скасувати бронювання",
    cancelTitle: "Скасувати бронювання?",
    cancelKeep: "Залишити місце",
    cancelFailed: "Скасувати не вийшло. Бронювання лишилося.",
    refundToWallet: "Те, що ти заплатив, повернеться кредитом у гаманець.",
    refundLostLate:
      "До початку менше ніж {hours} годин, тому кредит за цю гру не повернеться. Але скасування звільнить твоє місце для іншого гравця.",
    cancelConfirm: "Скасувати це бронювання? Кредит повернеться в гаманець.",
    cancelled: "Бронювання скасовано",
    addToCalendar: "Додати в календар",
    share: "Поділитися",
    coveredByCredit: "Кредит покрив цей матч повністю. Платити нічого.",
    coveredBySeed: "Ти у складі. За цей матч платити не потрібно.",
    backToGame: "← Назад до матчу",
    bookingNotFound: "Такого бронювання ми не знайшли.",
  },

  payment: {
    qrTitle: "Відскануй і заплати",
    qrHint:
      "Відкрий банківський застосунок і відскануй код. Платіж сам підставить потрібний символ.",
    account: "Рахунок",
    // The Czech term first, because that is the field in the banking app.
    variableSymbol: "Variabilní symbol (VS) — змінний символ",
    amount: "Сума",
    paidAlready: "Я заплатив",
    pendingConfirmation: "Чекаємо, поки організатор підтвердить платіж.",

    returnTitle: "Підтверджуємо платіж",
    confirmingTitle: "Підтверджуємо твій платіж…",
    confirmingBody:
      "Stripe отримав платіж. Чекаємо, поки підтвердження дійде до нас — зазвичай це кілька секунд.",
    slowTitle: "Ще обробляємо",
    slowBookingBody:
      "Stripe прийняв платіж і обробляє його. Бронювання підтвердиться зовсім скоро — платити вдруге не потрібно.",
    slowPassBody:
      "Stripe прийняв платіж і обробляє його. Кредити з’являться зовсім скоро — платити вдруге не потрібно.",
    slowBackToGame: "Назад до гри",
    slowBackToGames: "Назад до ігор",
    returnUnknownTitle: "Підтверджувати нічого",
    returnUnknownBody:
      "За цим акаунтом немає платежів, що очікують. Якщо ти щойно заплатив і це повторюється, твої ігри та кредити — у профілі.",
  },

  profile: {
    detailsTitle: "Твої дані",
    editDetails: "Змінити дані",
    saveProfile: "Зберегти профіль",
    cancelEdit: "Скасувати",
    displayName: "Відображуване ім’я",
    position: "Бажана позиція",
    positionHint: "Познач усі, на яких граєш.",
    skillLevel: "Рівень",
    nationality: "Громадянство",
    phone: "Телефон",
    phoneHint: "Його бачить лише організатор матчу, який ти забронював.",
    email: "E-mail",
    emailChangeHint: "Закрий форму — адреса змінюється поруч із нею вище.",
    notSet: "Не вказано",
    saved: "Профіль збережено",
    saveFailed: "Зберегти не вдалося. Спробуй ще раз.",
    positions: {
      gk: "Воротар",
      def: "Захисник",
      mid: "Півзахисник",
      att: "Нападник",
    },

    memberSince: "з {date}",

    tabOverview: "Огляд",
    tabGames: "Мої ігри",

    /*
     * THE THREE FORMS ARE CHOSEN BY `Intl.PluralRules("uk")`, not by this
     * file — see `lib/profile/statLabel.ts`. Ukrainian takes the same SHAPE as
     * Russian (one / few / many) and the boundaries are the ones CLDR knows:
     * 1 and 21 and 31 are `one`, 2–4 and 22–24 are `few`, 5–20 and 25–30 are
     * `many`. Written out here so a reviewer can check the words rather than
     * having to reconstruct which number reaches which line.
     */
    statGamesOne: "зіграна гра",
    statGamesFew: "зіграні ігри",
    statGamesMany: "зіграних ігор",
    statHoursOne: "година на полі",
    statHoursFew: "години на полі",
    statHoursMany: "годин на полі",
    statVenuesOne: "майданчик",
    statVenuesFew: "майданчики",
    statVenuesMany: "майданчиків",
    statMetOne: "зустрінутий гравець",
    statMetFew: "зустрінуті гравці",
    statMetMany: "зустрінутих гравців",

    badgesTitle: "Значки",
    badgesCount: "{earned} з {total}",

    badges: {
      firstGame: "Перша гра",
      firstGameHint: "Зіграй одну гру",
      regular: "Завсідник",
      regularHint: "Зіграй 5 ігор",
      veteran: "Ветеран",
      veteranHint: "Зіграй 20 ігор",
      explorer: "Дослідник",
      explorerHint: "Зіграй на 3 різних майданчиках",
      ironLegs: "Залізні ноги",
      ironLegsHint: "Проведи на полі 10 годин",
    },
  },

  account: {
    myGamesTitle: "Мої матчі",
    myGamesLink: "Усі мої матчі →",
    myGamesEmpty:
      "Ти ще не зайняв місце. Обери матч на дошці — і він з’явиться тут.",
    myGamesEmptyCta: "Знайти матч →",
    title: "Мій акаунт",
    myBookings: "Мої бронювання",
    noBookings: "Бронювань поки немає.",
    noBookingsTitle: "У твоєму складі порожньо",
    noBookingsBody: "Займи місце в будь-якому матчі — бронювання з’явиться тут разом із QR.",
    findAGame: "Знайти матч →",
    creditBalance: "Кредит",
    creditEmpty: "Кредиту поки немає.",
    showQr: "Показати QR для оплати",
    creditHint: "Кредит автоматично застосується до наступного бронювання.",
    historyTitle: "Твоя історія",
    gamesPlayedLabel: "Зіграно ігор",
    noShowsLabel: "Неявки",
    upcomingTitle: "Найближчі",
    waitlistTitle: "Черга",
    pastTitle: "Уже зіграно",
    pastEmpty: "Поки нічого не зіграно — перша гра з’явиться тут.",
    attendancePresent: "Прийшов",
    attendanceNoShow: "Не прийшов",

    topupTitle: "Поповни гаманець",
    topupLede: "Додай кредит зараз — він автоматично застосується до наступного бронювання.",
    topupCta: "Отримати абонемент",
    topupAmountLabel: "Сума",
    topupCustomLabel: "Або інша сума (CZK)",
    topupSubmit: "Показати QR для оплати",
    topupOutOfRange: "Обери суму від 50 до 2000 CZK.",
    topupPendingTitle: "Чекаємо на твій платіж",
    topupPendingBody:
      "Відскануй код у банківському застосунку. Гаманець оновиться, щойно організатор підтвердить, що платіж надійшов.",
    topupConfirmedTitle: "Це поповнення вже у твоєму гаманці.",
    topupBackToAccount: "← Назад до мого профілю",

    photoTitle: "Фото профілю",
    cropTitle: "Розмісти фото",
    cropHint: "Перетягни його та наблизь так, щоб у рамку потрапило те, що потрібно.",
    cropZoom: "Масштаб",
    cropSave: "Використати",
    coverChange: "Змінити обкладинку",
    photoUpload: "Завантажити фото",
    photoReplace: "Замінити фото",
    photoBadType: "Підійде JPG, PNG або WebP.",
    photoTooBig: "Зображення більше за 2 МБ. Обери менше.",
    photoUploadFailed: "Фото не завантажилося. Спробуй ще раз.",
    photoUploading: "Завантажуємо фото…",

    securityTitle: "Вхід і безпека",

    changePasswordTitle: "Змінити пароль",
    currentPasswordLabel: "Поточний пароль",
    newPasswordLabel: "Новий пароль",
    changePasswordSubmit: "Змінити пароль",
    changePasswordDone: "Пароль змінено.",
    currentPasswordWrong:
      "Це не твій поточний пароль. Якщо ти його не задавав, вийди та увійди за кодом із листа.",

    changeEmailTitle: "Змінити пошту",
    newEmailLabel: "Нова пошта",
    changeEmailSubmit: "Надіслати підтвердження",
    changeEmailHint:
      "Підтвердження надійде на поточну адресу і на нову. Пошта зміниться лише після того, як підтвердиш обидві.",
    changeEmailSent:
      "Надіслали два підтвердження — на {current} і на {next}. Відкрий обидва.",
    changeEmailSame: "Це вже твоя адреса.",
    changeEmailFailed: "Не вдалося почати зміну пошти. Спробуй ще раз.",

    changePasswordLink: "Змінити пароль",
    changeEmailLink: "Змінити e-mail",
    deleteAccount: "Видалити акаунт",
    deleteAccountHint: "Напиши нам — і ми видалимо твої дані.",
    deleteSubject: "Запит на видалення акаунта",
    badgePaid: "Оплачено",
    badgeReserved: "Чекає на оплату",
    badgeCash: "Готівкою на полі",
    badgeSeed: "Безкоштовно",
    badgeCancelled: "Скасовано",
    badgeExpired: "Протерміновано",
    past: "Минулі",
    upcoming: "Найближчі",
    cancelSuccess: "Бронювання скасовано. Кредит повернувся в гаманець.",
  },

  errors: {
    generic: "Щось пішло не так. Спробуй ще раз.",
    partyTooLarge: "Стільки гостей на одне бронювання не поміститься.",
    reasonRequired: "Напиши причину — її прочитають усі записані гравці.",
    passNotConfigured: "Цей абонемент поки не продається.",
    capacityFull: "Поки ти думав, місце зайняв хтось інший.",
    capacityFullTitle: "Місце вже зайняте",
    duplicateActiveBooking: "У тебе вже є місце в цьому матчі.",
    duplicateActiveBookingTitle: "Бронювання вже є",
    creditNegativeBlocked: "Кредиту на це бронювання не вистачає.",
    insufficientPermission: "У тебе немає прав на цю дію.",
    cancelWindowClosed: "Скасовувати це бронювання вже пізно.",
    notSignedIn: "Спершу увійди.",
    gameNotWaitlistable: "На цей матч черга не відкрита.",
    capacityFullWaitlist: "Місце дісталося іншому. У черзі на наступне ти лишаєшся.",
    gameNotBookable: "Цей матч закритий для бронювання.",
    gameAlreadyStarted: "Цей матч уже почався.",
    tryAgain: "Спробувати знову",
  },

  pass: {
    title: "Ігровий абонемент",
    lede: "Купи матчі заздалегідь зі знижкою. Гроші потраплять у гаманець як кредит і самі застосуються до наступного бронювання.",
    // The product name stays English in every locale — see lib/strings.ts.
    panelTitle: "Game Pass",
    panelBody: "Купи матчі заздалегідь зі знижкою",
    /*
     * `{n}` is substituted by `lib/pass/credits.ts`, which asks
     * `Intl.PluralRules("uk")` which of these three to use. Ukrainian: 1 and
     * 21 take `креди́т`, 2–4 take `кредити`, 5–20 take `кредитів` — and 11–14
     * take `кредитів` despite ending in 1–4, which is exactly the case a
     * hand-rolled `n % 10` gets wrong.
     */
    creditsOne: "{n} кредит",
    creditsFew: "{n} кредити",
    creditsMany: "{n} кредитів",
    creditEqualsGame: "1 кредит = 1 гра",

    // `{credits}` arrives as a finished phrase including the noun's form
    // ("1 кредит" / "3 кредити" / "12 кредитів"), so the sentence around it
    // must not itself agree with the number.
    creditsAddedTitle: "Кредити додано",
    creditsAddedCount: "Тепер у тебе {credits}.",
    creditsAddedBack: "Назад до ігор",
    tierPerGame: "{amount} за матч",
    tierSaving: "Економія {amount}",
    tierExpiresDays: "Діє {days} днів від моменту зарахування",
    tierNeverExpires: "Без терміну",
    tierBuy: "Купити абонемент",
    tierPurchase: "Купити",
    tierMostPopular: "Найпопулярніший",

    equivalence: "≈ {count} матчів",
    howItWorks: "Як це працює",
    howItWorksBody:
      "Платиш карткою або мобільним гаманцем. Щойно платіж підтверджено, кредити автоматично зараховуються на рахунок.",
    batchesTitle: "Твій кредит",
    batchesExpiring: "Лишилося {credits} · згорає {date}",
    batchesNever: "{credits} · без терміну",
    paymentsSoon: "Оплата скоро запрацює.",
    tryThePass: "Або спробуй Game Pass →",
    batchesNone: "Кредиту з терміном немає.",
  },

  toast: {
    bookingCreated: "Ти у складі. Місце заброньовано.",
    signedIn: "Вхід виконано.",
    bookingCancelled: "Скасовано — сума повернулася в гаманець як кредит.",
    topupConfirmed: "Поповнення підтверджено. Баланс оновлено.",
    linkCopied: "Посилання скопійовано.",
    failed: "Не вийшло. Спробуй ще раз.",
  },

  notifications: {
    clearAll: "Очистити все",
    bellLabel: "Сповіщення",
    title: "Сповіщення",
    empty: "Поки нічого.",
    kinds: {
      no_show_warning: {
        title: "Тебе позначили як неявку",
        body:
          "У тебе було місце, але ти не прийшов — і ніхто з черги його не отримав. " +
          "Наступного разу скасуй заздалегідь: місце одразу повернеться їм.",
      },
      no_show_cleared: {
        title: "Позначку про неявку знято",
        body: "Організатор виправив склад. Нічого за тобою не рахується.",
      },
    },
  },

  common: {
    back: "Назад",
    close: "Закрити",
    dismiss: "Сховати сповіщення",
    loading: "Завантаження…",
    // `czk` is NOT translated — see the header note on money.
  },

  /**
   * FAQ — DRAFT, like the rest of this file.
   *
   * Translated from the English finals of 2026-08-01, not from the Czech and
   * not from the Russian. The same judgement the Russian overlay records
   * applies: these four answers are product copy, and a clumsy sentence is a
   * smaller harm than a Ukrainian-speaking player meeting an English FAQ on a
   * page that is otherwise in their language.
   *
   * IT DOES NOT EXTEND TO THE TERMS OF SERVICE. `lib/content/legalDocuments.ts`
   * has no Ukrainian for the same reason it has no Russian: an unreviewed
   * contract is legally operative in a way an unreviewed FAQ is not.
   */
  faq: {
    title: "Питання",
    items: [
      {
        q: "Що взяти з собою?",
        a: "Взуття і себе. Манішки, рукавиці та м’ячі забезпечуємо ми — воротарі змінюються, тож свої нікому не потрібні.",
      },
      {
        q: "Як оплатити?",
        a: "Карткою або мобільним гаманцем під час бронювання або кредитами з абонемента.",
      },
      {
        q: "Що робити, якщо гра заповнена?",
        a: "Стань у чергу. Щойно місце звільниться, ми напишемо на пошту всім у списку — місце дістанеться тому, хто забере його першим.",
      },
      {
        q: "Чи треба добре грати?",
        a: "Чекаємо на гравців будь-якого рівня; ігри дружні, якщо для гри не вказано конкретний рівень. Воротарі та заміни йдуть по черзі, тож кожен добряче пограє.",
      },
    ],
  },
};
