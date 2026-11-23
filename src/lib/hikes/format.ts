import type { Locale } from "../i18n/locales";

/**
 * Часовой пояс клуба.
 *
 * Проставляется во всё форматирование дат явно. Сервер на Vercel живёт в UTC,
 * и без этого поход, выходящий в 6 утра, показывался бы участникам как
 * вчерашний в час ночи — а по этой дате люди приходят на точку сбора.
 */
export const CLUB_TIMEZONE = "Asia/Almaty";

/**
 * Неразрывный пробел (U+00A0), заданный кодом, а не самим символом.
 * В исходнике он неотличим от обычного пробела: любая правка вслепую его
 * теряет, а заметно это становится только на узком экране, где сумма или
 * счётчик мест разрываются посреди числа.
 */
export const NBSP = String.fromCharCode(0xa0);

/*
 * Язык сайта → локаль Intl. Язык у всех функций ниже необязательный и по
 * умолчанию русский: экраны лидера остаются русскими, и их вызовы не меняются.
 *
 * en-GB, а не en-US: «Sunday 20 September» и 24-часовое время, как в Алматы,
 * а не «9/20» и «6:00 AM».
 */
const INTL_LOCALE: Record<Locale, string> = { ru: "ru-RU", en: "en-GB", kk: "kk-KZ" };

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      timeZone: CLUB_TIMEZONE,
      ...options,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** «14 сентября» */
export function formatDate(iso: string, locale: Locale = "ru"): string {
  return dateFormatter(locale, { day: "numeric", month: "long" }).format(new Date(iso));
}

/**
 * «понедельник, 14 сентября», с годом — «понедельник, 18 мая 2026»
 *
 * Год нужен только прошедшим походам: у ближайших он и так очевиден, а на
 * вкладке истории без него «18 мая» через сезон станет двусмысленным — она
 * и существует ради нескольких лет сразу.
 */
export function formatDateWithWeekday(
  iso: string,
  withYear = false,
  locale: Locale = "ru",
): string {
  const formatted = dateFormatter(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(withYear && { year: "numeric" }),
  }).format(new Date(iso));

  // Intl отдаёт «18 мая 2026 г.» — сокращение забирает место, из-за которого
  // строка переносится, и ничего не добавляет: год и так виден.
  return locale === "ru" ? formatted.replace(/\s*г\.$/, "") : formatted;
}

/**
 * Дробное число по правилам языка: «10,5» по-русски и по-казахски, «10.5»
 * по-английски.
 *
 * Точку ставит JS, и на русской странице она читается как чужая — рядом же
 * стоят «3 000 ₸» и «14 сентября». Целые числа проходят насквозь: «12 км»
 * дробной части не получает.
 */
export function formatNumber(value: number, locale: Locale = "ru"): string {
  return locale === "en" ? String(value) : String(value).replace(".", ",");
}

/** «06:30» */
export function formatTime(iso: string, locale: Locale = "ru"): string {
  return dateFormatter(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** «14 сентября, 06:30» */
export function formatDateTime(iso: string, locale: Locale = "ru"): string {
  return `${formatDate(iso, locale)}, ${formatTime(iso, locale)}`;
}

/**
 * «26 сентября (суббота), 12:00» — для сроков, которые человек сверяет со
 * своей неделей: открытие и закрытие записи, рубеж отмены.
 *
 * День недели в скобках, а не впереди: «до суббота, 26 сентября» по-русски
 * не склоняется, а скобки читаются после любого предлога. Просьба автора
 * 21 сентября 2026: «до 26 сентября» заставляло считать, какой это день.
 */
export function formatDeadline(iso: string, locale: Locale = "ru"): string {
  const weekday = dateFormatter(locale, { weekday: "long" }).format(new Date(iso));
  return `${formatDate(iso, locale)} (${weekday}), ${formatTime(iso, locale)}`;
}

/**
 * Целое число с разделителем разрядов языка и неразрывными пробелами:
 * «12 345» по-русски, «12,345» по-английски.
 *
 * Intl в разных версиях ICU ставит разделителем то U+00A0, то U+202F,
 * поэтому результат нормализуем, а не доверяем ему как есть.
 */
export function formatInteger(value: number, locale: Locale = "ru"): string {
  return value.toLocaleString(INTL_LOCALE[locale]).replace(/\s/g, NBSP);
}

/** «1 200 ₸» с неразрывными пробелами внутри. */
export function formatCost(amount: number, locale: Locale = "ru"): string {
  return `${formatInteger(amount, locale)}${NBSP}₸`;
}

/**
 * Формы слова для склонения по числу.
 *
 * Все четыре обязательны, хотя английскому и казахскому нужны только one и
 * other: тип словаря выводится из русского, и так забытая форма у русского не
 * соберётся. Неиспользуемые формы в en/kk просто повторяют other.
 *
 * «{n}» в форме заменяется числом, склеенным со словом неразрывным пробелом.
 */
export type PluralForms = { one: string; few: string; many: string; other: string };

/**
 * Форма для числа по правилам языка: «1 место, 2 места, 5 мест», «1 spot,
 * 5 spots», «5 орын». Правила — из Intl.PluralRules, а не свои: у казахского
 * после числа существительное не меняется вовсе, и своя функция для каждого
 * языка — это три места для одной и той же ошибки.
 */
export function pluralize(n: number, forms: PluralForms, locale: Locale = "ru"): string {
  const category = new Intl.PluralRules(INTL_LOCALE[locale]).select(n);
  const form = (forms as Record<string, string>)[category] ?? forms.other;
  return form.replace("{n} ", `${formatInteger(n, locale)}${NBSP}`).replace("{n}", formatInteger(n, locale));
}

/**
 * Правильная форма слова для числа: 1 место, 2 места, 5 мест.
 * Без этого счётчик мест — главный элемент карточки — читается как машинный.
 *
 * Только русский — для экранов лидера. На страницах с языком — pluralize().
 */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «4 места» — число и слово склеены неразрывным пробелом. */
export function pluralWithNumber(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return `${n}${NBSP}${plural(n, one, few, many)}`;
}

/** Русские подписи категорий — для экранов лидера, анонса и картинок превью. */
export const CATEGORY_LABELS: Record<number, string> = {
  1: "прогулка",
  2: "несложный маршрут",
  3: "требует подготовки",
  4: "сложный маршрут",
  5: "серьёзный маршрут",
};

/**
 * Сколько прошло: «только что», «20 минут назад», «вчера».
 *
 * Нужно ровно в одном месте — на сборке чата, где лидер смотрит, давно ли
 * отправил человеку ссылку. Точное время там бесполезно: вопрос не «когда»,
 * а «пора ли напоминать». Дальше суток отвечаем датой: «три дня назад» уже
 * не помогает решить, а сбивает.
 *
 * `now` аргументом, а не внутри: время — величина нечистая, и функция,
 * которая ходит за ним сама, не проверяется тестом.
 */
export function formatAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) return "только что";
  if (minutes < 60) {
    return `${minutes}${NBSP}${plural(minutes, "минуту", "минуты", "минут")} назад`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}${NBSP}${plural(hours, "час", "часа", "часов")} назад`;
  }

  return formatDateTime(iso);
}
