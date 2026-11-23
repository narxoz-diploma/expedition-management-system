/**
 * Функции базы отвечают кодами: MEMBERS_ONLY, PROFILE_INCOMPLETE и так далее.
 * Показывать их человеку нельзя, а разбирать по строке в каждом месте вызова —
 * значит рано или поздно показать сырой текст исключения Postgres.
 *
 * Здесь единственное место, где код превращается в текст.
 */

import type { Locale } from "./i18n/locales";

export type DbErrorCode =
  | "NOT_AUTHENTICATED"
  | "HIKE_NOT_FOUND"
  | "HIKE_NOT_OPEN"
  | "HIKE_CANCELLED"
  | "REGISTRATION_NOT_OPEN"
  | "REGISTRATION_CLOSED"
  | "PROFILE_INCOMPLETE"
  | "MEMBERS_ONLY"
  | "BANNED"
  | "ALUMNI_NEEDS_MANUAL_APPROVAL"
  | "ALREADY_REGISTERED"
  | "NOT_REGISTERED"
  | "USER_NOT_FOUND"
  | "LEADS_FUTURE_HIKE"
  | "FORBIDDEN"
  | "NOT_A_DRAFT"
  | "DRAFT_HAS_REGISTRATIONS"
  | "DRAFT_HAS_PHOTOS"
  | "NO_FREE_SPOT"
  | "NOT_IN_WAITLIST"
  | "UNKNOWN";

const RU: Record<DbErrorCode, string> = {
  NOT_AUTHENTICATED: "Нужно войти, чтобы записаться.",
  HIKE_NOT_FOUND: "Поход не найден. Возможно, его удалили.",
  HIKE_NOT_OPEN: "Запись на этот поход ещё не открыта.",
  HIKE_CANCELLED: "Поход отменён.",
  REGISTRATION_NOT_OPEN: "Запись пока закрыта — откроется ближе к дате.",
  REGISTRATION_CLOSED: "Запись на этот поход уже закрыта.",
  PROFILE_INCOMPLETE: "Сначала заполни профиль — это займёт минуту.",
  MEMBERS_ONLY:
    "Этот поход только для участников клуба. Начни с похода с пометкой «можно новичкам».",
  // Без слова «забанен» и без причины: экран видят с чужого телефона, а
  // публичное клеймо тут лишнее. Причина хранится для клуба, не для показа.
  BANNED: "Запись на походы сейчас закрыта. Напиши лидеру клуба.",
  ALUMNI_NEEDS_MANUAL_APPROVAL:
    "Ты в статусе выпускника — напиши лидеру, он запишет тебя вручную.",
  ALREADY_REGISTERED: "Ты уже записан на этот поход.",
  NOT_REGISTERED: "Ты не записан на этот поход.",
  NO_FREE_SPOT: "Свободных мест нет. Чтобы взять ещё человека, подними вместимость в правке похода.",
  NOT_IN_WAITLIST: "Этого человека уже нет в очереди — обнови страницу.",
  USER_NOT_FOUND: "Пользователь не найден.",
  LEADS_FUTURE_HIKE:
    "Сначала передай ответственность за будущий поход другому лидеру.",
  FORBIDDEN: "Недостаточно прав для этого действия.",
  NOT_A_DRAFT: "Удалить можно только черновик.",
  DRAFT_HAS_REGISTRATIONS:
    "На этот поход уже записывались — его не удалить. Он останется черновиком, участники его не видят.",
  DRAFT_HAS_PHOTOS: "Сначала убери фотографии похода, потом удаляй черновик.",
  UNKNOWN: "Что-то пошло не так. Попробуй ещё раз.",
};

const EN: Record<DbErrorCode, string> = {
  NOT_AUTHENTICATED: "You need to sign in to sign up.",
  HIKE_NOT_FOUND: "Hike not found. It may have been removed.",
  HIKE_NOT_OPEN: "Registration for this hike isn't open yet.",
  HIKE_CANCELLED: "This hike is cancelled.",
  REGISTRATION_NOT_OPEN: "Registration is closed for now — it opens closer to the date.",
  REGISTRATION_CLOSED: "Registration for this hike is already closed.",
  PROFILE_INCOMPLETE: "Complete your profile first — it takes a minute.",
  MEMBERS_ONLY:
    "This hike is for club members only. Start with a hike marked “open to newcomers”.",
  BANNED: "Sign-ups are closed for you right now. Message a club leader.",
  ALUMNI_NEEDS_MANUAL_APPROVAL:
    "You have alumni status — message a leader and they'll sign you up manually.",
  ALREADY_REGISTERED: "You're already signed up for this hike.",
  NOT_REGISTERED: "You're not signed up for this hike.",
  NO_FREE_SPOT: "No free spots. To take one more person, raise the capacity in the hike editor.",
  NOT_IN_WAITLIST: "This person is no longer on the waitlist — refresh the page.",
  USER_NOT_FOUND: "User not found.",
  LEADS_FUTURE_HIKE: "First hand over your upcoming hike to another leader.",
  FORBIDDEN: "You don't have permission for this action.",
  NOT_A_DRAFT: "Only a draft can be deleted.",
  DRAFT_HAS_REGISTRATIONS:
    "People have already signed up for this hike — it can't be deleted. It will stay a draft; participants can't see it.",
  DRAFT_HAS_PHOTOS: "Remove the hike's photos first, then delete the draft.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** Казахский — не вычитан, см. dictionaries/kk.ts. */
const KK: Record<DbErrorCode, string> = {
  NOT_AUTHENTICATED: "Жазылу үшін кіру керек.",
  HIKE_NOT_FOUND: "Жорық табылмады. Мүмкін, ол жойылған.",
  HIKE_NOT_OPEN: "Бұл жорыққа жазылу әлі ашылмаған.",
  HIKE_CANCELLED: "Жорық тоқтатылды.",
  REGISTRATION_NOT_OPEN: "Жазылу әзірге жабық — күнге жақын ашылады.",
  REGISTRATION_CLOSED: "Бұл жорыққа жазылу жабылды.",
  PROFILE_INCOMPLETE: "Алдымен профильді толтыр — бір минут алады.",
  MEMBERS_ONLY:
    "Бұл жорық тек клуб мүшелеріне арналған. «Жаңадан келгендерге болады» белгісі бар жорықтан баста.",
  BANNED: "Жорықтарға жазылу қазір жабық. Клуб жетекшісіне жаз.",
  ALUMNI_NEEDS_MANUAL_APPROVAL:
    "Сен түлек мәртебесіндесің — жетекшіге жаз, ол сені қолмен жазады.",
  ALREADY_REGISTERED: "Сен бұл жорыққа жазылғансың.",
  NOT_REGISTERED: "Сен бұл жорыққа жазылмағансың.",
  NO_FREE_SPOT: "Бос орын жоқ. Тағы біреуді алу үшін жорықты өңдеуде орын санын көбейт.",
  NOT_IN_WAITLIST: "Бұл адам енді кезекте жоқ — бетті жаңарт.",
  USER_NOT_FOUND: "Пайдаланушы табылмады.",
  LEADS_FUTURE_HIKE: "Алдымен алдағы жорықты басқа жетекшіге бер.",
  FORBIDDEN: "Бұл әрекетке құқық жеткіліксіз.",
  NOT_A_DRAFT: "Тек жобаны жоюға болады.",
  DRAFT_HAS_REGISTRATIONS:
    "Бұл жорыққа жазылғандар бар — оны жою мүмкін емес. Ол жоба болып қалады, қатысушылар оны көрмейді.",
  DRAFT_HAS_PHOTOS: "Алдымен жорық суреттерін алып таста, содан кейін жобаны жой.",
  UNKNOWN: "Бірдеңе дұрыс болмады. Қайталап көр.",
};

/*
 * Язык по умолчанию — русский: экраны лидера остаются русскими, и их вызовы
 * без языка не меняются. Язык передают только действия, которые зовут со
 * страниц участника, — запись и отмена.
 */
const MESSAGES: Record<Locale, Record<DbErrorCode, string>> = { ru: RU, en: EN, kk: KK };

const KNOWN = new Set(Object.keys(RU));

/**
 * Достаёт код из ошибки Supabase.
 *
 * raise exception 'MEMBERS_ONLY' приезжает в message, но не всегда голым:
 * PostgREST добавляет вокруг него свой текст. Поэтому ищем известный код
 * внутри строки, а не сравниваем её целиком.
 */
export function dbErrorCode(error: unknown): DbErrorCode {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);

  for (const code of KNOWN) {
    if (raw.includes(code)) return code as DbErrorCode;
  }
  return "UNKNOWN";
}

export function dbErrorMessage(error: unknown, locale: Locale = "ru"): string {
  return MESSAGES[locale][dbErrorCode(error)];
}
