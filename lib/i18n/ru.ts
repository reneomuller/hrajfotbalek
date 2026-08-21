import type { StringsOverlay } from "@/lib/i18n/resolve";

/**
 * Russian.
 *
 * Player-facing copy only, same scope as the Czech overlay — the admin panel,
 * the email templates and the privacy page stay English. See
 * `lib/i18n/locales.ts`.
 *
 * THE PAYMENT VOCABULARY STAYS CZECH, and that is the most important decision
 * in this file. A Russian-speaking player in Prague pays from a Czech bank
 * account: the screen they are about to open says "variabilní symbol" and
 * offers a "QR platba", and the amount is in CZK. Translating those terms into
 * Russian would produce a screen that reads beautifully and does not match the
 * one it is instructing them to use — and a payment sent with the wrong
 * reference arrives unmatched, which is the one failure here that costs manual
 * reconciliation to undo. So the Czech term is kept and explained in Russian
 * rather than replaced.
 *
 * Register: "ты", matching the familiar tone of the English and Czech.
 */
export const ru: StringsOverlay = {
  meta: {
    title: "Hraj Fotbal — футбол без обязательств в Праге",
    description: "Один матч, который повторяется. Найди игру, займи место, приходи.",
  },

  nav: {
    cta: "Занять место",
    games: "Матчи",
    logIn: "Войти",
    homeShort: "Главная",
    pass: "Абонемент",
    myGames: "Мои матчи",
    profileShort: "Профиль",
    primary: "Главная навигация",
    profile: "Мой профиль",
    home: "Hraj Fotbal — на главную",
  },

  siteFooter: {
    privacy: "Приватность",
    terms: "Условия",
    contact: "Контакт",
  },

  notFound: {
    title: "Здесь ничего нет",
    body: "Эта ссылка ведёт на страницу, которой не существует — или на матч, который уже давно сыгран.",
    cta: "Посмотреть, что играем →",
  },

  landing: {
    // DRAFT — flagged for the standing native-review batch.
    // Split at the first sentence; the period after line one is drawn in volt
    // by the component, so it is not in the string.
    heroLine1: "Играй в футбол",
    heroLine2: "Когда угодно. Где угодно.",
    vision: "Один матч, который повторяется. Найди игру, займи место, приходи.",
    heroCta: "Найти матч →",
    scrollHint: "↓ ЛИСТАЙ",
    steps: [
      { index: "01", title: "Найди матч", body: "Игры рядом с тобой, каждую неделю." },
      {
        index: "02",
        title: "Займи место",
        body: "Забронируй место, оплатив взнос. Остальное — на нас.",
      },
      {
        index: "03",
        title: "Приходи и играй",
        body: "Приходи на поле и наслаждайся игрой",
      },
    ],
    statsGamesLabel: "Матчей каждую неделю",
    statsPlayersLabel: "Активных игроков",
    nextMatchesLabel: "Предстоящие матчи",
    nextMatchesAll: "Все матчи →",
    potmTitle: "Игрок месяца",
    potmEmpty: "Пока никого — может, это будешь ты.",
    potmHours: "{hours} ч на поле в этом месяце",
    community: {
      title: "Присоединяйся к нам",
      body: "Подписывайся на наши соцсети, чтобы быть в курсе новостей сообщества",
    },
    footer: {
      city: "· ПРАГА",
    },
  },

  auth: {
    loginTitle: "Вход",
    // DRAFT — flagged for the standing native-review batch.
    loginLede: "Почта и пароль. Пароля ещё нет? Воспользуйся ссылкой для сброса.",
    signInSubmit: "Войти",
    invalidCredentials: "Почта и пароль не совпадают.",
    emailNotConfirmed:
      "Сначала подтверди почту — открой ссылку, которую мы прислали при регистрации.",

    // DRAFT — flagged for the standing native-review batch.
    forgotPasswordLink: "Забыли пароль?",
    resetTitle: "Сброс пароля",
    resetLede: "Пришлём на почту шестизначный код. Введи его здесь и задай новый пароль.",
    resetBackToLogin: "← Назад ко входу",
    forgotPasswordLead: "Забыл пароль или ещё не задавал его?",
    forgotPasswordCta: "Прислать код",

    setPasswordTitle: "Задай пароль",
    setPasswordLede: "Ты вошёл. Выбери пароль — и в следующий раз почта не понадобится.",
    setPasswordSubmit: "Сохранить пароль",
    setPasswordSkip: "Не сейчас — останусь на коде",
    setPasswordFailed: "Не удалось сохранить пароль. Попробуй ещё раз.",
    emailLabel: "Почта",
    sendLink: "Отправить ссылку",
    linkSent: "Загляни в почту — ссылка уже летит.",
    otpLead: "Или введи 6-значный код из письма:",
    otpLabel: "6-значный код",
    otpSubmit: "Войти",
    otpInvalid: "Код неверный или истёк. Запроси новый.",
    otpMalformed: "В коде шесть цифр.",
    linkExpired: "Срок действия ссылки истёк. Запроси новую.",
    signOut: "Выйти",
    emailInvalid: "Это не похоже на адрес электронной почты.",
    linkSendFailed: "Не получилось отправить ссылку. Попробуй ещё раз.",
    callbackFailed: "Эта ссылка для входа недействительна или уже использована.",
    callbackErrorTitle: "Войти не получилось",
    callbackRetry: "Запросить новую ссылку",
    callbackDetailLabel: "Технические детали",

    signupTitle: "Создай аккаунт",
    signupLede: "Один аккаунт, один ник — и ты в составе.",
    signupFinishTitle: "Заверши профиль",
    signupFinishLede: "Почта подтверждена. Остался последний шаг.",

    passwordLabel: "Пароль",
    passwordHint: "Минимум 8 символов",
    passwordTooShort: "Нужно минимум 8 символов.",

    countryLabel: "Страна",
    countryPlaceholder: "Выбери страну",
    countryInvalid: "Выбери, пожалуйста, страну из списка.",

    skillLabel: "Как ты играешь?",
    skillHint: "Показывается в профиле. Бронировать игру это никогда не мешает.",
    skillBeginner: "Начинающий",
    skillIntermediate: "Средний уровень",
    skillAdvanced: "Опытный",
    skillRequired: "Выбери, пожалуйста, уровень.",

    // DRAFT — flagged for the standing native-review batch.
    phoneLabel: "Телефон",
    phoneRequired: "Нужен телефон, чтобы организатор мог связаться с тобой по игре.",
    phoneInvalid: "Номер телефона — от 3 до 32 символов.",
    phoneHint: "Его видит только организатор и только по играм, которые ты забронировал.",

    legalGroupLabel: "Перед началом",
    tosLabel: "Я принимаю условия обслуживания.",
    tosLink: "Читать условия",
    tosRequired: "Чтобы продолжить, прими условия.",
    preferencesGroupLabel: "Необязательно",

    emailTaken:
      "Аккаунт с такой почтой уже есть. Войди — или воспользуйся кодом, если пароля ещё нет.",
    signupFailed: "Не получилось создать аккаунт. Попробуй ещё раз.",

    verifyTitle: "Подтверди почту",
    verifyBody:
      "Мы отправили ссылку на {email}. Открой её — и аккаунт готов; ссылка работает на любом устройстве.",
    verifyHint: "Письма нет пару минут? Проверь спам и попробуй снова.",

    signUp: "Регистрация",
    noAccountLead: "Ещё не с нами?",
    createAccountCta: "Регистрация →",
    haveAccount: "Уже есть аккаунт?",
    // DRAFT — flagged for the standing native-review batch.
    googleContinue: "Продолжить через Google",
    googleSignUp: "Регистрация через Google",
    googleFailed: "Не удалось начать вход через Google. Попробуй ещё раз.",
    authOr: "или",
    noAccount: "Впервые здесь?",
    nicknameLabel: "Ник",
    nicknameHint: "Буквы, цифры, пробелы, _ и - · до 20 символов",
    nicknameInvalid: "Только буквы, цифры, пробелы, _ и - (до 20 символов).",
    nicknameTaken: "Такой ник уже занят. Попробуй другой.",
    gdprLabel: "Я согласен с политикой конфиденциальности.",
    gdprLink: "Читать политику конфиденциальности",
    gdprRequired: "Без согласия с политикой продолжить не получится.",
    marketingLabel: "Присылайте письма о новых матчах. (Необязательно)",
    createAccount: "Создать аккаунт",
  },

  games: {
    listTitle: "Ближайшие матчи",
    empty: "Пока нет ни одного матча.",
    emptyTitle: "Игр пока нет",
    emptyBody: "Новые игры появляются каждую неделю.",
    emptyCta: "Вступай в группу WhatsApp",
    spotsLeft: "мест свободно",
    spotLeft: "место свободно",
    full: "Мест нет",
    durationMin: "{n} мин",
    past: "Завершено",
    joinWaitlist: "Встать в очередь",
    fullNotice: "Матч заполнен — все места заняты.",
    seeOtherGames: "Другие матчи →",
    onWaitlist: "Ты в очереди",
    waitlistJoined: "Ты в очереди. Напишем, как только освободится место.",
    waitlistAlready: "Ты уже в очереди на этот матч.",
    waitlistHint:
      "Как только место освободится, об этом узнают все в очереди одновременно — место достанется тому, кто займёт его первым.",
    waitlistPosition: "Ты #{position} в очереди",
    waitlistConvertTitle: "Занять освободившееся место",
    waitlistConvertHint: "Выбери, как платишь, и место твоё.",
    waitlistNotOnList: "Тебя нет в очереди на этот матч.",
    waitlistJoinedTitle: "Ты в очереди",
    waitlistSpotOpenTitle: "Место освободилось",
    waitlistSpotOpenBody:
      "Все в очереди узнали одновременно. Займи его — и оно твоё.",
    waitlistNotOnListTitle: "Тебя нет в этой очереди",
    waitlistNotOnListBody:
      "Возможно, место уже заняли, или ты записался на другой матч.",
    waitlistSeeGame: "Открыть матч",
    rosterTitle: "Состав",
    rosterEmpty: "Пока никто не занял место",
    cancelled: "Этот матч отменён.",
    notFound: "Такого матча нет или он ещё не опубликован.",
    backToGames: "← Все матчи",
    viewGame: "Открыть матч",
    copyLink: "Копировать ссылку",
    copyLinkFailed: "Не удалось скопировать — зажми адресную строку.",
    dayFilterAll: "Все",
    dayToday: "Сегодня",
    dayTomorrow: "Завтра",
    dayTomorrowShort: "Завтра",
    rosterReserved: "держит место",
    rosterConfirmed: "в составе",
    filledLabel: "ЗАНЯТО",
    joinNote: "Одно касание — и место твоё. Заплати заранее с телефона.",
    openMap: "ОТКРЫТЬ КАРТУ ↗",
    mapAlt: "Карта площадки",
    venuePhotoAlt: "Поле {venue}",
    surface: {
      turf: "Искусственный газон",
      grass: "Трава",
      indoor: "Зал",
      sand: "Песок",
    },
    subsPerTeam: "{count} запасных на команду",
    skillLevel: {
      beginner: "Новичок",
      intermediate: "Средний",
      advanced: "Опытный",
    },
    skillNotEnforced: "Рады всем — это ориентир, а не правило.",

    organizerLabel: "Организатор",

    yourBookingTitle: "Ты в составе",
    yourBookingHeld: "Место забронировано — подтверди его оплатой.",
    yourBookingConfirmed: "Оплачено. Увидимся на поле.",
    yourBookingCash: "Платишь наличными на поле.",
    yourBookingPay: "Оплатить место",
    yourBookingManage: "Управлять бронью",

    openMapFull: "Открыть место на карте",
    organizerRole: "Организует этот матч",
    // DRAFT — flagged for the standing native-review batch.
    organizerWhatsApp: "Написать в WhatsApp",
    organizerWhatsAppMessage: "Привет! Вопрос по игре {game}.",
    // DRAFT — flagged for the standing native-review batch.
    cardJoinCue: "Играю",
    availabilityLabel: "Свободные места",
    playersOfCapacity: "{booked} / {capacity} игроков",
    playersTitle: "Игроки ({count})",
    /*
     * Russian forms a possessive by declining the name, which cannot be done
     * safely to a free-text nickname. The dash keeps the relationship without
     * asserting a grammatical case the nickname may not have.
     */
    guestOfPlayer: "{name} — гость {n}",
    guestNumbered: "Гость {n}",
    guestAvatarLabel: "Гость",
    gamesPlayed: "матчей: {count}",
    gamePlayedOne: "1 матч",
    gamesPlayedNone: "Первый матч",
    includedTitle: "Что входит",
    pitchAmenitiesTitle: "Инфраструктура площадки",
    amenities: {
      bibs: "Манишки",
      gloves: "Вратарские перчатки",
      balls: "Мячи",
      water: "Вода",
      drinks: "Напитки",
      showers: "Душевые",
      lockers: "Шкафчики",
      parking: "Парковка",
      wifi: "Wi-Fi",
      first_aid: "Аптечка",
    },
    practicalTitle: "Информация об игре",
    practicalRotatingKeepers: "Вратари меняются",
    practicalRotatingSubs: "Замены по очереди",
    practicalMeetingPoint: "Место встречи",
    practicalArrival: "Приходи за 10 минут до начала.",
    practicalDuration: "Длительность",
    practicalDurationValue: "{minutes} минут",

    notesLabel: "Информация об игре",
    capacityLabel: "Вместимость",
    startsLabel: "Начало",
    venueLabel: "Где",
    priceLabel: "Цена",
    alreadyStarted: "Этот матч уже начался.",
    inProgress: "Этот матч идёт прямо сейчас.",

    urgencyOpen: "Есть места",
    urgencyLastFew: "Почти заполнен",
    urgencyFull: "Мест нет",

    waitlistTitle: "Очередь",
    waitlistEmpty: "Пока никто не ждёт — место всё ещё достаётся первому.",
    waitlistYou: "Ты",
    waitlistCount: "в очереди",
    onWaitlistBadge: "Ты в очереди",

    nextGameStrip: "Твой следующий матч",
    nextGameStripCta: "Открыть бронь →",

    shareWhatsApp: "Поделиться в WhatsApp",
    shareMessage: "{venue} · {when}\nЗайми место: {url}",
  },

  booking: {
    claimSpot: "Занять место",
    logInToClaim: "Войди, чтобы занять место",
    signInToClaim: "Войди, чтобы забронировать",
    barPaid: "Оплачено",
    barAmountDue: "К оплате {amount}",
    barKickedOffAt: "Начало в {time}",
    barCancelled: "Отменено",
    barOnWaitlist: "Ты {n}-й в листе ожидания",
    barOnWaitlistNoPosition: "Ты в листе ожидания",
    barCancel: "Отменить",
    barLabel: "Твоё место на этом матче",
    nicknameLabel: "Ник",
    nicknameHint: "Буквы, цифры, пробелы, _ и - · до 20 символов",
    // "QR platba" — the Czech banking app's own name for it, kept and glossed.
    payByQr: "Оплатить по QR (QR platba)",
    payByQrHint:
      "Отсканируй QR в банковском приложении. Место держим за тобой, пока не придёт платёж.",
    // DRAFT — flagged for the standing native-review batch.
    // DRAFT — flagged for the standing native-review batch.
    payWithCredit: "Списать кредит",
    payWithCreditHint: "Спишется {seats} кредит(ов) из кошелька. Платить ничего не нужно.",
    payWithCreditNone: "У тебя пока нет кредитов.",
    addCredits: "Пополнить кредиты →",
    payOnline: "Онлайн-оплата",
    payOnlineHint: "Безопасно через Stripe",
    payOnlineComingSoon: "Скоро",
    payByCash: "Наличными на поле",
    payByCashHint: "Возьми наличные. Организатор подтвердит тебя на месте.",
    choosePayment: "Как будешь платить?",
    partyTitle: "Берёшь кого-то с собой?",
    partyHint: "Они играют как твои гости. Одна бронь, одна оплата, одна отмена.",
    partyJustMe: "Только я",
    partySummary: "{seats} мест · {total}",
    partyLimited: "На это поле поместится ещё только {n}.",
    partyOnlineQuantity: "На странице оплаты укажи количество {seats}.",
    awaitingTitle: "Ждём твою оплату",
    awaitingBody:
      "Место держим {minutes} минут, пока проходит платёж. Страница обновится сама.",
    awaitingExpiredTitle: "Платёж не пришёл",
    awaitingExpiredBody:
      "Мы не увидели оплату вовремя, и место вернулось в игру. Если ещё есть места, попробуй снова.",
    awaitingAttentionTitle: "Проверяем твой платёж",
    awaitingAttentionBody:
      "Платёж пришёл, но место выдать не получилось. Мы уже разбираемся и свяжемся с тобой — не плати ещё раз.",
    awaitingSeatGone:
      "Пока тебя не было, игра заполнилась, так что платить не за что. Ничего не списано.",
    awaitingRetry: "Повторить оплату",
    cancelReassuranceKickoff:
      "Отменить можно в любой момент до начала — всё вернётся кредитом в кошелёк.",
    cancelReassuranceCutoff:
      "Отменить можно за {hours} ч до начала — всё вернётся кредитом в кошелёк.",
    confirmBooking: "Подтвердить бронь",
    reserved: "Место забронировано",
    confirmed: "Платёж подтверждён",
    creditApplied: "Кредит применён",
    amountDue: "К оплате",
    // DRAFTS — flagged for native review with the slogan pair.
    notEnoughCreditsTitle: "Кредитов не хватает",
    notEnoughCreditsBody:
      "Игра стоит 1 кредит. Возьми абонемент и сэкономь до {percent} %, или оплати эту игру по QR.",
    getCredits: "Получить кредиты",
    payByQrThisGame: "Оплатить эту игру по QR",
    cancelBooking: "Отменить бронь",
    cancelTitle: "Отменить бронь?",
    cancelKeep: "Оставить место",
    cancelFailed: "Отменить не вышло. Бронь осталась.",
    refundToWallet: "То, что ты заплатил, вернётся кредитом в кошелёк.",
    // DRAFT — flagged for the standing native-review batch.
    refundLostLate:
      "До начала меньше {hours} часов, поэтому кредит за эту игру не вернётся. Но отмена освободит твоё место для другого игрока.",
    cancelConfirm: "Отменить эту бронь? Кредит вернётся в кошелёк.",
    cancelled: "Бронь отменена",
    addToCalendar: "Добавить в календарь",
    share: "Поделиться",
    coveredByCredit: "Кредит покрыл этот матч полностью. Платить нечего.",
    coveredBySeed: "Ты в составе. За этот матч платить не нужно.",
    backToGame: "← Назад к матчу",
    bookingNotFound: "Такую бронь мы не нашли.",
  },

  payment: {
    qrTitle: "Отсканируй и заплати",
    qrHint:
      "Открой банковское приложение и отсканируй код. Платёж сам подставит нужный символ.",
    account: "Счёт",
    // The Czech term first, because that is the field in the banking app.
    variableSymbol: "Variabilní symbol (VS) — переменный символ",
    amount: "Сумма",
    paidAlready: "Я заплатил",
    pendingConfirmation: "Ждём, пока организатор подтвердит платёж.",
  },

  profile: {
    editDetails: "Изменить данные",
    saveProfile: "Сохранить профиль",
    cancelEdit: "Отмена",
    displayName: "Отображаемое имя",
    position: "Предпочитаемая позиция",
    positionHint: "Отметь все, на которых играешь.",
    skillLevel: "Уровень",
    nationality: "Гражданство",
    phone: "Телефон",
    phoneHint: "Его видит только организатор матча, который ты забронировал.",
    email: "E-mail",
    emailChangeHint: "Закрой форму — адрес меняется рядом с ним выше.",
    notSet: "Не указано",
    saved: "Профиль сохранён",
    saveFailed: "Сохранить не удалось. Попробуй ещё раз.",
    positions: {
      gk: "Вратарь",
      def: "Защитник",
      mid: "Полузащитник",
      att: "Нападающий",
    },

    // DRAFT — flagged for the standing native-review batch.
    memberSince: "с {date}",

    tabOverview: "Обзор",
    tabGames: "Мои игры",
    tabSettings: "Настройки",

    statGamesOne: "сыгранная игра",
    statGamesFew: "сыгранные игры",
    statGamesMany: "сыгранных игр",
    statHoursOne: "час на поле",
    statHoursFew: "часа на поле",
    statHoursMany: "часов на поле",
    statVenuesOne: "площадка",
    statVenuesFew: "площадки",
    statVenuesMany: "площадок",

    badgesTitle: "Значки",
    badgesCount: "{earned} из {total}",

    badges: {
      firstGame: "Первая игра",
      firstGameHint: "Сыграй одну игру",
      regular: "Завсегдатай",
      regularHint: "Сыграй 5 игр",
      veteran: "Ветеран",
      veteranHint: "Сыграй 20 игр",
      explorer: "Исследователь",
      explorerHint: "Сыграй на 3 разных площадках",
      ironLegs: "Железные ноги",
      ironLegsHint: "Проведи на поле 10 часов",
    },
  },

  account: {
    myGamesTitle: "Мои матчи",
    myGamesLink: "Все мои матчи →",
    myGamesEmpty:
      "Ты ещё не занял место. Выбери матч на доске — и он появится здесь.",
    myGamesEmptyCta: "Найти матч →",
    title: "Мой аккаунт",
    myBookings: "Мои брони",
    noBookings: "Броней пока нет.",
    noBookingsTitle: "В твоём составе пусто",
    noBookingsBody: "Займи место в любом матче — бронь появится здесь вместе с QR.",
    findAGame: "Найти матч →",
    creditBalance: "Кредит",
    creditEmpty: "Кредита пока нет.",
    showQr: "Показать QR для оплаты",
    creditHint: "Кредит автоматически применится к следующей брони.",
    historyTitle: "Твоя история",
    gamesPlayedLabel: "Сыграно игр",
    noShowsLabel: "Неявки",
    upcomingTitle: "Ближайшие",
    pastTitle: "Уже сыграно",
    pastEmpty: "Пока ничего не сыграно — первая игра появится здесь.",
    attendancePresent: "Пришёл",
    attendanceNoShow: "Не пришёл",

    topupTitle: "Пополни кошелёк",
    topupLede: "Добавь кредит сейчас — он автоматически применится к следующей брони.",
    topupCta: "Получить абонемент",
    topupAmountLabel: "Сумма",
    topupCustomLabel: "Или другая сумма (CZK)",
    topupSubmit: "Показать QR для оплаты",
    topupOutOfRange: "Выбери сумму от 50 до 2000 CZK.",
    topupPendingTitle: "Ждём твой платёж",
    topupPendingBody:
      "Отсканируй код в банковском приложении. Кошелёк обновится, как только организатор подтвердит, что платёж пришёл.",
    topupConfirmedTitle: "Это пополнение уже в твоём кошельке.",
    topupBackToAccount: "← Назад в мой профиль",

    photoTitle: "Фото профиля",
    coverChange: "Сменить обложку",
    photoUpload: "Загрузить фото",
    photoReplace: "Заменить фото",
    photoBadType: "Подойдёт JPG, PNG или WebP.",
    photoTooBig: "Изображение больше 2 МБ. Выбери поменьше.",
    photoUploadFailed: "Фото не загрузилось. Попробуй ещё раз.",
    photoUploading: "Загружаем фото…",

    securityTitle: "Вход и безопасность",

    changePasswordTitle: "Сменить пароль",
    currentPasswordLabel: "Текущий пароль",
    newPasswordLabel: "Новый пароль",
    changePasswordSubmit: "Сменить пароль",
    changePasswordDone: "Пароль изменён.",
    currentPasswordWrong:
      "Это не твой текущий пароль. Если ты его не задавал, выйди и войди по коду из письма.",

    changeEmailTitle: "Сменить почту",
    newEmailLabel: "Новая почта",
    changeEmailSubmit: "Отправить подтверждения",
    changeEmailHint:
      "Подтверждение придёт на текущий адрес и на новый. Почта сменится только после того, как подтвердишь оба.",
    changeEmailSent:
      "Отправили два подтверждения — на {current} и на {next}. Открой оба.",
    changeEmailSame: "Это уже твой адрес.",
    changeEmailFailed: "Не удалось начать смену почты. Попробуй ещё раз.",

    changePasswordLink: "Сменить пароль",
    changeEmailLink: "Сменить e-mail",
    deleteAccount: "Удалить аккаунт",
    deleteAccountHint: "Напиши нам — и мы удалим твои данные.",
    deleteSubject: "Запрос на удаление аккаунта",
    badgePaid: "Оплачено",
    badgeReserved: "Ждёт оплаты",
    badgeCash: "Наличными на поле",
    badgeSeed: "Бесплатно",
    badgeCancelled: "Отменено",
    badgeExpired: "Истекло",
    past: "Прошедшие",
    upcoming: "Ближайшие",
    cancelSuccess: "Бронь отменена. Кредит вернулся в кошелёк.",
  },

  errors: {
    generic: "Что-то пошло не так. Попробуй ещё раз.",
    partyTooLarge: "Столько гостей на одну бронь не поместится.",
    capacityFull: "Пока ты думал, место занял кто-то другой.",
    capacityFullTitle: "Место уже занято",
    duplicateActiveBooking: "У тебя уже есть место в этом матче.",
    duplicateActiveBookingTitle: "Бронь уже есть",
    creditNegativeBlocked: "Кредита на эту бронь не хватает.",
    insufficientPermission: "У тебя нет прав на это действие.",
    cancelWindowClosed: "Отменять эту бронь уже поздно.",
    notSignedIn: "Сначала войди.",
    gameNotWaitlistable: "На этот матч очередь не открыта.",
    capacityFullWaitlist: "Место досталось другому. В очереди на следующее ты остаёшься.",
    gameNotBookable: "Этот матч закрыт для брони.",
    gameAlreadyStarted: "Этот матч уже начался.",
    tryAgain: "Попробовать снова",
  },

  pass: {
    title: "Игровой абонемент",
    lede: "Купи матчи заранее со скидкой. Деньги попадут в кошелёк как кредит и сами применятся к следующей брони.",
    // The product name stays English in every locale — see lib/strings.ts.
    panelTitle: "Game Pass",
    panelBody: "Купи матчи заранее со скидкой",
    creditsOne: "{n} кредит",
    creditsFew: "{n} кредита",
    creditsMany: "{n} кредитов",
    creditEqualsGame: "1 кредит = 1 игра",
    tierPerGame: "{amount} за матч",
    tierSaving: "Экономия {amount}",
    tierExpiresDays: "Действует {days} дней с момента зачисления",
    tierNeverExpires: "Без срока",
    tierBuy: "Купить абонемент",
    tierPurchase: "Купить",
    tierMostPopular: "Самый популярный",
    equivalence: "≈ {count} матчей",
    howItWorks: "Как это работает",
    howItWorksBody:
      "Платишь картой или мобильным кошельком. Как только платёж подтверждён, кредиты автоматически зачисляются на счёт.",
    batchesTitle: "Твой кредит",
    batchesExpiring: "Осталось {amount} · сгорает {date}",
    batchesNever: "{amount} · без срока",
    tryThePass: "Или попробуй Game Pass →",
    batchesNone: "Кредита со сроком нет.",
  },

  toast: {
    bookingCreated: "Ты в составе. Место забронировано.",
    signedIn: "Вход выполнен.",
    bookingCancelled: "Отменено — сумма вернулась в кошелёк как кредит.",
    topupConfirmed: "Пополнение подтверждено. Баланс обновлён.",
    linkCopied: "Ссылка скопирована.",
    failed: "Не прошло. Попробуй ещё раз.",
  },

  notifications: {
    // DRAFT — flagged for the standing native-review batch.
    bellLabel: "Уведомления",
    title: "Уведомления",
    empty: "Пока ничего.",
  },

  common: {
    back: "Назад",
    close: "Закрыть",
    dismiss: "Скрыть уведомление",
    loading: "Загрузка…",
    // `czk` is NOT translated — see the header note on money.
  },

  /**
   * FAQ — DRAFT, AWAITING A NATIVE READER.
   *
   * Translated from the English finals of 2026-08-01, not from the Czech, so
   * this is a translation of the source rather than a translation of a
   * translation. No Russian speaker has reviewed it.
   *
   * It ships anyway, and that is the right call for THIS content: these six
   * answers are product copy, and a clumsy sentence is a smaller harm than a
   * Russian-speaking player reading an English FAQ on a page that is otherwise
   * in their language. The judgement does NOT extend to the terms of service —
   * see `lib/content/legalDocuments.ts`, where Russian is deliberately absent
   * because an unreviewed contract is legally operative in a way an unreviewed
   * FAQ is not.
   *
   * Flagged for review in the phase report. When a native pass happens, this
   * comment goes with it.
   */
  faq: {
    title: "Вопросы",
    items: [
      { q: "Когда приходить?", a: "За 10 минут до начала." },
      {
        q: "Что взять с собой?",
        a: "Обувь и себя. Манишки, вратарские перчатки и мячи мы обеспечиваем.",
      },
      {
        q: "Как оплатить?",
        a: "После брони отсканируйте QR-код в приложении своего банка или заплатите наличными на поле.",
      },
      {
        q: "А если я не смогу прийти?",
        a: "Отмените бронь в любой момент до начала игры — вся сумма вернётся кредитом в ваш кошелёк.",
      },
      {
        q: "А если мест уже нет?",
        a: "Встаньте в лист ожидания: как только место освободится, мы сразу напишем вам на почту.",
      },
      {
        q: "Нужно ли хорошо играть?",
        a: "Мы рады игрокам любого уровня; игры любительские, если у игры не указан конкретный уровень.",
      },
    ],
  },
};
