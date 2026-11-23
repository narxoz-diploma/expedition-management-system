import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, LOCALES, type Locale } from "./locales";

/**
 * Язык текущего запроса — для серверных компонентов.
 *
 * Его ставит proxy заголовком (см. LOCALE_HEADER). Нет заголовка — русский:
 * так ведёт себя всё, что proxy обходит стороной.
 *
 * Внутри unstable_cache не вызывать: заголовки там запрещены по той же
 * причине, что и куки, — одна запись кэша на всех.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get(LOCALE_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * revalidatePath для страницы на всех языках.
 *
 * Страницы лежат под app/[lang], а до них доходят через rewrite в proxy. Next
 * требует путь назначения, а не адрес из браузера (документация revalidatePath,
 * «Using revalidatePath with rewrites»): revalidatePath("/hikes") после
 * переезда молча не совпал бы ни с одной страницей, и лидер перестал бы
 * видеть свою правку. Все четыре проверки при этом прошли бы.
 *
 * Путь — как в браузере по-русски: «/hikes», «/», «/admin/hikes/1».
 */
export function revalidateLocalized(path: string, type?: "layout" | "page"): void {
  for (const locale of LOCALES) {
    revalidatePath(path === "/" ? `/${locale}` : `/${locale}${path}`, type);
  }
}
