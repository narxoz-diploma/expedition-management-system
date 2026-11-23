import { en } from "./dictionaries/en";
import { kk } from "./dictionaries/kk";
import { ru, type Dictionary } from "./dictionaries/ru";
import type { Locale } from "./locales";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { ru, en, kk };

/**
 * Словарь языка.
 *
 * Все три загружены сразу, без import() по требованию, как в примере Next:
 * тексты интерфейса — килобайты, а ленивая загрузка делала бы функцию
 * асинхронной там, где ждать нечего. Если словари вырастут до заметного
 * размера, первым делом смотреть сюда.
 *
 * В клиентские компоненты уходит не весь словарь, а нужный кусок пропсом.
 */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * Подстановка — в своём модуле, см. fill.ts. Здесь реэкспорт для серверных
 * компонентов, которым словарь всё равно нужен целиком. Клиентским —
 * импортировать из "@/lib/i18n/fill", иначе в бандл уедут все словари.
 */
export { fill } from "./fill";
