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
    profile: "Мой профиль",
    home: "Hraj Fotbal — на главную",
  },

  siteFooter: {
    privacy: "Приватность",
    contact: "Контакт",
  },

  notFound: {
    title: "Здесь ничего нет",
    body: "Эта ссылка ведёт на страницу, которой не существует — или на матч, который уже давно сыгран.",
    cta: "Посмотреть, что играем →",
  },

  landing: {
    heroSub: "Присоединяйся и играй в удовольствие.",
    vision: "Один матч, который повторяется. Найди игру, займи место, приходи.",
    heroCta: "Найти матч →",
    scrollHint: "↓ ЛИСТАЙ",
    steps: [
      { index: "01", title: "НАЙДИ МАТЧ", body: "Игры рядом с тобой, каждую неделю." },
      { index: "02", title: "ЗАЙМИ МЕСТО", body: "Введи ник — и ты в составе." },
      {
        index: "03",
        title: "ПРИХОДИ И ИГРАЙ",
        body: "Заплати заранее с телефона. Готово.",
      },
    ],
    nextMatchLabel: "СЛЕДУЮЩИЙ МАТЧ",
    nextMatchCta: "Занять место",
    community: {
      title: "ПРИСОЕДИНЯЙСЯ К КОМПАНИИ",
      body: "Новые матчи каждую неделю. Следи и играй.",
      whatsapp: "ГРУППА В WHATSAPP",
    },
    footer: {
      city: "· ПРАГА",
      tagline: "ПРИХОДИ ЗА ИГРОЙ · ОСТАВАЙСЯ ЗА КОМПАНИЮ",
    },
  },

  auth: {
    loginTitle: "Вход",
    loginLede: "Пришлём ссылку на почту. Пароль запоминать не нужно.",
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

    signupTitle: "Выбери ник",
    signupLede: "Под этим именем ты будешь в составе.",
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
    emptyTitle: "Пока ничего не назначено",
    emptyBody:
      "Следующий матч обычно появляется за несколько дней. Вступай в группу WhatsApp — узнаешь первым.",
    emptyCta: "Вступить в группу WhatsApp →",
    spotsLeft: "мест свободно",
    spotLeft: "место свободно",
    full: "Мест нет",
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
    rosterTitle: "Состав",
    rosterEmpty: "В составе пока никого — будь первым.",
    cancelled: "Этот матч отменён.",
    notFound: "Такого матча нет или он ещё не опубликован.",
    backToGames: "← Все матчи",
    viewGame: "Открыть матч",
    rosterReserved: "держит место",
    rosterConfirmed: "в составе",
    filledLabel: "ЗАНЯТО",
    joinNote: "Одно касание — и место твоё. Заплати заранее с телефона.",
    openMap: "ОТКРЫТЬ КАРТУ ↗",
    mapAlt: "Карта площадки",
    surface: {
      turf: "Искусственный газон",
      grass: "Трава",
      indoor: "Зал",
      sand: "Песок",
    },
    notesLabel: "Полезно знать",
    capacityLabel: "Вместимость",
    startsLabel: "Начало",
    venueLabel: "Где",
    priceLabel: "Цена",
    alreadyStarted: "Этот матч уже начался.",

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
    nicknameLabel: "Ник",
    nicknameHint: "Буквы, цифры, пробелы, _ и - · до 20 символов",
    // "QR platba" — the Czech banking app's own name for it, kept and glossed.
    payByQr: "Оплатить по QR (QR platba)",
    payByQrHint:
      "Отсканируй QR в банковском приложении. Место держим за тобой, пока не придёт платёж.",
    payByCash: "Наличными на поле",
    payByCashHint: "Возьми наличные. Организатор подтвердит тебя на месте.",
    choosePayment: "Как будешь платить?",
    cancelReassuranceKickoff:
      "Отменить можно в любой момент до начала — всё вернётся кредитом в кошелёк.",
    cancelReassuranceCutoff:
      "Отменить можно за {hours} ч до начала — всё вернётся кредитом в кошелёк.",
    confirmBooking: "Подтвердить бронь",
    reserved: "Место забронировано",
    confirmed: "Платёж подтверждён",
    creditApplied: "Кредит применён",
    amountDue: "К оплате",
    cancelBooking: "Отменить бронь",
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

  account: {
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

  common: {
    back: "Назад",
    close: "Закрыть",
    loading: "Загрузка…",
    // `czk` is NOT translated — see the header note on money.
  },
};
