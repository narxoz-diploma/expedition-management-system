"use client";

import { useLayoutEffect } from "react";

import { THEME_SCRIPT } from "@/lib/theme";

type ThemeWindow = Window & { __stepUpTheme?: { apply: () => void } };

/**
 * Страховка скрипта темы: если он не выполнился, выполняет его сам.
 *
 * Тему ставит скрипт в <head> до отрисовки (lib/theme.ts), и на обычной
 * странице этого хватает. Но после переезда страниц под app/[lang] 404
 * приходит потоком, и React вставляет разметку, включая этот <script>, сам —
 * а вставленный так скрипт браузер не выполняет никогда. Человек со светлой
 * темой получал тёмную 404, без цвета полосы, и переключатель темы в меню
 * там тоже молчал бы: window.__stepUpTheme не существовало. Проверено на
 * production-сборке 15 сентября 2026 чтением этого глобала; на раскладке без
 * [lang] такого не было.
 *
 * Строка та же, что в <head>: логика темы остаётся в одном месте. Есть глобал
 * — скрипт уже отработал, и достаточно повторить apply().
 *
 * useLayoutEffect, а не useEffect: успевает до отрисовки кадра, иначе на 404
 * мелькал бы тёмный экран.
 */
export function ThemeKeeper() {
  useLayoutEffect(() => {
    const theme = (window as ThemeWindow).__stepUpTheme;
    if (theme) {
      theme.apply();
      return;
    }
    // Своя константа из исходников, пользовательских данных в ней нет.
    new Function(THEME_SCRIPT)();
  }, []);

  return null;
}
