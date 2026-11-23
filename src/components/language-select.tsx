"use client";

import { useRef } from "react";

import {
  closeOnBackdrop,
  SHEET_BODY_CLASS,
  SHEET_DIALOG_CLASS,
  SheetHandle,
  useSheet,
} from "@/components/sheet";
import {
  LOCALE_CODES,
  LOCALE_NAMES,
  SWITCHER_LOCALES,
  switchLocaleHref,
  type Locale,
} from "@/lib/i18n/locales";

/**
 * Выбор языка в шапке и на входе.
 *
 * Своё меню, а не системный <select> (решение автора, 15 сентября 2026):
 * системный список на каждом телефоне выглядит по-своему и чужим сайту. Та же
 * шторка, что у меню аккаунта, — снизу на телефоне, выпадающим на компьютере.
 *
 * Казахский в списке, только если он уже открыт: пока лидеры не вычитали
 * перевод, в него попадают по адресу /kk, и уйти оттуда обратно надо тем же
 * меню (ROADMAP, «Три языка»).
 */
export function LanguageSelect({ locale, label }: { locale: Locale; label: string }) {
  const { dialog, sheet, open } = useSheet();
  const button = useRef<HTMLButtonElement>(null);
  const options = SWITCHER_LOCALES.includes(locale) ? SWITCHER_LOCALES : [...SWITCHER_LOCALES, locale];

  function choose(target: Locale) {
    if (target === locale) {
      dialog.current?.close();
      return;
    }
    // Полная загрузка, а не мягкий переход: язык берут шапка, подвал и
    // метаданные из layout, а при мягком переходе layout не перерисуется.
    // Адрес — текущий целиком, с поиском и якорем: человек остаётся там же.
    const { pathname, search, hash } = window.location;
    window.location.assign(switchLocaleHref(pathname + search + hash, target));
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => open(button.current)}
        aria-haspopup="dialog"
        aria-label={`${label}: ${LOCALE_NAMES[locale]}`}
        className="flex h-tap shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 shrink-0"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
        </svg>
        {LOCALE_CODES[locale]}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        aria-label={label}
        onClick={closeOnBackdrop}
        // На компьютере — под самой кнопкой: место замеряет open(), потому
        // что на входе шапки нет и геометрию шапки здесь не повторить.
        className={`${SHEET_DIALOG_CLASS} sm:top-(--sheet-top) sm:right-(--sheet-right) sm:w-56`}
      >
        <div ref={sheet} tabIndex={-1} autoFocus className={SHEET_BODY_CLASS}>
          <SheetHandle />
          <p className="px-3 pt-1 pb-1 text-xs font-semibold text-fg-muted">{label}</p>
          <ul>
            {options.map((value) => {
              const current = value === locale;
              return (
                <li key={value}>
                  <button
                    type="button"
                    lang={value}
                    aria-current={current ? "true" : undefined}
                    onClick={() => choose(value)}
                    // Текущий помечен фоном и галочкой, а не цветом рамки:
                    // так же, как выбранная тема в меню аккаунта.
                    className={`flex h-tap w-full items-center gap-3 rounded-xl px-3 text-left ${
                      current ? "bg-surface font-semibold" : "hover:bg-surface"
                    }`}
                  >
                    <span className="flex-1">{LOCALE_NAMES[value]}</span>
                    {current ? (
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-5 shrink-0 text-accent-500"
                      >
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    ) : (
                      <span aria-hidden className="text-xs text-fg-muted">
                        {LOCALE_CODES[value]}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </>
  );
}
