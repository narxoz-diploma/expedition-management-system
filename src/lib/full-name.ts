/**
 * Имя и фамилия человека — такими, какими их ищут в списке группы.
 *
 * До 14 сентября 2026 проверка была «не короче двух символов», а в поле
 * сразу приезжал ник из Google: «Тест», «dssolved», «Аня🌸». Лидер собирает
 * группу по списку и звонит по нему с маршрута — ник там бесполезен (решение
 * автора: спрашивать имя и фамилию и проверять).
 *
 * Проверка намеренно не строже нужного. Отклонять правильные данные вреднее,
 * чем пропустить странные (см. грабли про телефон в CLAUDE.md): поэтому
 * любые буквы любого алфавита, дефис и апостроф — «Анна-Мария», «О'Коннор»,
 * казахские буквы — проходят, а регистр не трогаем вовсе: «ван дер Берг»
 * пишется именно так.
 *
 * Модуль без импортов приложения — его гоняет `node --test`.
 */

import type { Locale } from "./i18n/locales";

const WORD = /^\p{L}+(?:[-'’]\p{L}+)*$/u;

type Problem = "empty" | "tooLong" | "digits" | "symbols" | "oneWord" | "initials" | "typo";

/*
 * Тексты — здесь, а не в словаре сайта: модуль читают тесты, а словарь тянет
 * за собой импорты приложения. Русский — по умолчанию, тесты сверяют его.
 * Казахский не вычитан, см. dictionaries/kk.ts.
 */
const MESSAGES: Record<Locale, Record<Problem, string>> = {
  ru: {
    empty: "Как тебя зовут?",
    tooLong: "Слишком длинное имя",
    digits: "Имя без цифр — как в документах",
    symbols: "Только буквы — без эмодзи и значков",
    oneWord: "Напиши имя и фамилию — по ним лидер находит тебя в списке группы",
    initials: "Имя и фамилию целиком, без инициалов",
    typo: "Похоже на опечатку — проверь имя",
  },
  en: {
    empty: "What's your name?",
    tooLong: "That name is too long",
    digits: "No digits in your name — write it as in your documents",
    symbols: "Letters only — no emoji or symbols",
    oneWord: "Write your first and last name — the leader finds you by them in the group list",
    initials: "Your full first and last name, no initials",
    typo: "Looks like a typo — check your name",
  },
  kk: {
    empty: "Атың кім?",
    tooLong: "Аты тым ұзын",
    digits: "Атында сан болмауы керек — құжаттағыдай",
    symbols: "Тек әріптер — эмодзи мен белгілерсіз",
    oneWord: "Атың мен тегіңді жаз — жетекші топ тізімінен сені солар бойынша табады",
    initials: "Атың мен тегіңді толық жаз, бас әріптерсіз",
    typo: "Қате жазылған сияқты — атыңды тексер",
  },
};

/** Лишние пробелы по краям и между словами — не ошибка, а шум. */
export function normalizeFullName(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(" ");
}

function problemOf(raw: string): Problem | null {
  const value = normalizeFullName(raw);
  if (value.length === 0) return "empty";
  if (value.length > 120) return "tooLong";
  if (/\d/.test(value)) return "digits";

  const words = value.split(" ");
  if (!words.every((word) => WORD.test(word))) return "symbols";
  if (words.length < 2) return "oneWord";

  const letters = words.map((word) => word.replace(/[-'’]/g, "").toLowerCase());
  if (letters.some((word) => word.length < 2)) return "initials";
  // «Ааа Ббб» — не имя, а попытка пройти форму.
  if (letters.some((word) => new Set(word).size === 1)) return "typo";

  return null;
}

/** Что не так с именем — или null, если всё в порядке. */
export function fullNameProblem(raw: string, locale: Locale = "ru"): string | null {
  const problem = problemOf(raw);
  return problem && MESSAGES[locale][problem];
}
