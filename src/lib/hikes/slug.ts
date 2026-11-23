// Расширение обязательно: модуль запускается напрямую Node в тестах.
import { CLUB_TIMEZONE } from "./format.ts";

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
  // Казахские буквы: маршруты называются «Бутаковка», «Кок Жайляу»,
  // но встречаются и «Көкжайлау», «Іле Алатау».
  ә: "a", ғ: "g", қ: "q", ң: "ng", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** Транслитерация в латиницу: адрес похода должен читаться и пересылаться. */
export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("");
}

/** Дата в часовом поясе клуба, в виде 2026-09-14. */
function isoDateInClubZone(iso: string): string {
  // en-CA даёт ровно ГГГГ-ММ-ДД — короче, чем собирать из частей руками.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Адрес похода: `kok-zhailau-2026-09-14`.
 *
 * Дата в адресе обязательна. Клуб ходит на одни и те же маршруты каждый
 * семестр, и без неё второй поход на Кок Жайляу упёрся бы в уникальный индекс,
 * а прошлогодние ссылки в чате вели бы на новый поход.
 */
export function buildHikeSlug(title: string, startsAt: string): string {
  const base = transliterate(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  const date = isoDateInClubZone(startsAt);
  return base ? `${base}-${date}` : `hike-${date}`;
}
