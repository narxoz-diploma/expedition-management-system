/**
 * Языки сайта и то, как язык живёт в адресе.
 *
 * Язык — первым сегментом пути, а не кукой и не поддоменом: ссылки
 * пересылают в WhatsApp, и язык должен ехать вместе со ссылкой (разбор в
 * ROADMAP, фаза 2, «Три языка»). Русский — без приставки: все ссылки, уже
 * разосланные по чатам, продолжают работать как были.
 *
 * Язык браузера не угадываем (решение автора, 15 сентября 2026): ссылка
 * открывается на том языке, на котором её отправили.
 *
 * Модуль без импортов приложения: его гоняет node --test.
 */

export const LOCALES = ["ru", "en", "kk"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";

/**
 * Языки в переключателе. Казахский открыт 23 сентября 2026, после первого
 * «норм» от лидера-носителя: язык с шероховатостями полезнее, чем его
 * отсутствие (решение автора). Правки остальных лидеров вносятся по ходу.
 */
export const SWITCHER_LOCALES: readonly Locale[] = ["ru", "en", "kk"];

/**
 * Закрыты от поисковиков: непроверенный перевод не должен попасть в выдачу.
 * Казахский — в меню, но здесь, пока вычитку не подтвердят все лидеры.
 */
export const UNREVIEWED_LOCALES: readonly Locale[] = ["kk"];

/** Название языка на нём самом — так его ищут глазами в переключателе. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша",
};

/** Короткий код — на кнопке языка в шапке, где на полное название нет места. */
export const LOCALE_CODES: Record<Locale, string> = {
  ru: "RU",
  en: "EN",
  kk: "KK",
};

/**
 * Заголовок, которым proxy передаёт язык серверным компонентам.
 *
 * Не пропсом от layout: шапка, подвал и 404 лежат глубже и в разных местах, а
 * not-found пропсов не получает вовсе. Ставится proxy на каждый запрос —
 * присланный клиентом перезаписывается.
 */
export const LOCALE_HEADER = "x-step-up-locale";

/**
 * Разделы без языка в адресе. Экраны лидера остаются русскими (решение
 * автора, 15 сентября 2026): лидеров несколько человек, все пишут по-русски.
 * /auth — обработчик входа, лежит вне [lang].
 */
const UNLOCALIZED_PREFIXES = ["/admin", "/auth"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function pathOf(href: string): string {
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

function hasPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function localeOfPath(path: string): Locale | null {
  const first = path.split("/")[1];
  return isLocale(first) ? first : null;
}

export type LocaleRoute =
  | { action: "pass"; locale: Locale }
  | { action: "rewrite"; locale: Locale; pathname: string }
  | { action: "redirect"; pathname: string };

/**
 * Что proxy делает с входящим адресом.
 *
 * Внутри приложения все страницы лежат под app/[lang], поэтому русский адрес
 * без приставки переписывается на /ru/… — браузер этого не видит. Явный /ru/…
 * уводится на адрес без приставки: у страницы должен быть один адрес, иначе
 * одна и та же ссылка ходит по чатам в двух видах.
 */
export function resolveLocaleRoute(pathname: string): LocaleRoute {
  // Служебные адреса Next (/_next, /__nextjs_…) — мимо. Без этого в dev
  // переписывались бы запросы оверлея ошибок.
  if (pathname.startsWith("/_")) return { action: "pass", locale: DEFAULT_LOCALE };

  const locale = localeOfPath(pathname);
  if (locale) {
    const rest = pathname.slice(locale.length + 1) || "/";
    if (locale === DEFAULT_LOCALE || UNLOCALIZED_PREFIXES.some((p) => hasPrefix(rest, p))) {
      return { action: "redirect", pathname: rest };
    }
    return { action: "pass", locale };
  }

  if (hasPrefix(pathname, "/auth")) return { action: "pass", locale: DEFAULT_LOCALE };

  return {
    action: "rewrite",
    locale: DEFAULT_LOCALE,
    pathname: pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`,
  };
}

/**
 * Внутренняя ссылка на текущем языке: «/hikes» → «/en/hikes».
 *
 * Внешние ссылки, якоря, экраны лидера и уже размеченные адреса проходят как
 * есть. Русский приставки не получает.
 */
export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const path = pathOf(href);
  if (localeOfPath(path)) return href;
  if (UNLOCALIZED_PREFIXES.some((p) => hasPrefix(path, p))) return href;
  if (locale === DEFAULT_LOCALE) return href;

  return path === "/" ? `/${locale}${href.slice(1)}` : `/${locale}${href}`;
}

/**
 * Путь без приставки языка: «/en/hikes» → «/hikes», «/ru» → «/».
 *
 * Для сравнений в клиентских компонентах. После rewrite в proxy сервер
 * рендерит внутренний путь /ru/…, а в браузере адрес без приставки, и
 * usePathname() на двух сторонах может отличаться. Сравнивать можно только то,
 * что от этого не зависит: иначе «startsWith("/hikes")» молча не срабатывает
 * на /en/hikes, а подсветка пункта расходится при гидратации.
 */
export function pathWithoutLocale(pathname: string): string {
  const locale = localeOfPath(pathname);
  return locale ? pathname.slice(locale.length + 1) || "/" : pathname;
}

/** Тот же адрес на другом языке — для переключателя. */
export function switchLocaleHref(current: string, target: Locale): string {
  const path = pathOf(current);
  const tail = current.slice(path.length);
  const locale = localeOfPath(path);
  const bare = locale ? path.slice(locale.length + 1) || "/" : path;
  return localizeHref(bare + tail, target);
}
