"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Шторка поверх страницы: на телефоне выезжает снизу, на компьютере
 * выпадает под кнопкой. Общая для меню аккаунта и выбора языка.
 *
 * Вынесена из меню аккаунта, когда появилось второе такое меню
 * (15 сентября 2026): каждая строка здесь — найденная пальцем поломка, и
 * копия потеряла бы их по одной.
 *
 * Модальный <dialog>, а не popover. Первая версия меню стояла на popover —
 * он немодальный, и на телефоне это дало три беды разом (проверка автора,
 * 14 сентября 2026): нажатие мимо закрывало меню И проходило на страницу;
 * страница под шторкой прокручивалась; свайп вниз тянул браузерное
 * «обновить страницу». Модальный диалог страницу выключает, Escape и
 * системную «назад» даёт браузер, а пока меню открыто, страница ещё и не
 * прокручивается (lockPage).
 */
export function useSheet() {
  const dialog = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  /**
   * `anchor` — кнопка, под которой выпадать на компьютере. Без него место
   * задаёт класс диалога (меню аккаунта знает геометрию шапки).
   */
  function open(anchor?: HTMLElement | null) {
    const d = dialog.current;
    if (!d) return;
    // Хвост закрытия свайпом: шторка осталась смещённой за край и без
    // перехода. Сбрасываем до открытия, иначе она выехала бы не снизу.
    d.style.transition = "";
    d.style.translate = "";
    // Блокировка до замера: снятая полоса прокрутки сдвигает шапку, и
    // замеренное раньше место отстало бы от кнопки на её ширину.
    lockPage(true);
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      d.style.setProperty("--sheet-top", `${rect.bottom + 8}px`);
      d.style.setProperty(
        "--sheet-right",
        `${document.documentElement.clientWidth - rect.right}px`,
      );
    }
    d.showModal();
  }

  useEffect(() => {
    // Шапка лежит в layout, при мягкой навигации её DOM не пересоздаётся —
    // без этого меню осталось бы висеть поверх новой страницы.
    if (dialog.current?.open) dialog.current.close();
  }, [pathname]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    // Разблокировка — по событию close, а не в своих обработчиках: диалог
    // закрывают и Escape, и системная «назад», и мимо нас.
    const unlock = () => lockPage(false);
    d.addEventListener("close", unlock);
    return () => {
      d.removeEventListener("close", unlock);
      lockPage(false);
    };
  }, []);

  /*
   * Свайп вниз закрывает шторку. Слушатели нативные и не пассивные: только
   * так можно отменить жест у браузера — React вешает touchmove пассивным, и
   * preventDefault из него игнорируется, отсюда и тянувшееся «обновить
   * страницу».
   *
   * Жест становится свайпом, только если список шторки в самом начале и
   * палец пошёл вниз. Пошёл вверх или список прокручен — это прокрутка
   * списка, и её не трогаем. На компьютере меню выпадающее, тянуть нечего.
   */
  useEffect(() => {
    const el = sheet.current;
    const d = dialog.current;
    if (!el || !d) return;

    let startY = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;

    function onStart(event: TouchEvent) {
      if (window.matchMedia("(min-width: 40rem)").matches) return;
      tracking = el!.scrollTop <= 0;
      dragging = false;
      startY = event.touches[0].clientY;
      dy = 0;
    }

    function onMove(event: TouchEvent) {
      if (!tracking) return;
      const delta = event.touches[0].clientY - startY;
      if (!dragging) {
        // Несколько пикселей на решение: иначе дрожь пальца при нажатии на
        // пункт превращалась бы в свайп.
        if (delta > 6) dragging = true;
        else if (delta < -6) tracking = false;
        return;
      }
      event.preventDefault();
      dy = Math.max(0, delta);
      d!.style.transition = "none";
      d!.style.translate = `0 ${dy}px`;
    }

    function onEnd() {
      if (dragging) {
        // Порог в 80px: случайный сдвиг не закрывает, уверенный жест — да.
        if (dy > 80) {
          // Доезжает вниз и закрывается там. Сначала здесь стоял сброс
          // смещения, а потом close(): шторка на полсекунды возвращалась
          // наверх — сброс анимировался, и allow-discrete держал её на экране
          // до конца анимации (замечание автора, 14 сентября 2026). Стили
          // сбрасывает следующее открытие, а не закрытие: сброс здесь снова
          // запустил бы тот же переход.
          d!.style.transition = "translate 160ms ease-in";
          d!.style.translate = "0 100%";
          window.setTimeout(() => {
            d!.style.transition = "none";
            d!.close();
          }, 160);
        } else {
          // Недотянул — шторка плавно возвращается на место.
          d!.style.transition = "";
          d!.style.translate = "";
        }
      }
      tracking = false;
      dragging = false;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return { dialog, sheet, open };
}

/**
 * Нажатие по затемнению приходит в сам <dialog>: всё видимое меню —
 * внутренний блок, и цель события совпадает с диалогом только снаружи него.
 * Страница под затемнением нажатие не получает — диалог модальный.
 */
export function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
  if (event.target === event.currentTarget) event.currentTarget.close();
}

/*
 * Классы диалога без места на компьютере — его дописывает каждое меню само.
 *
 * Телефон (по умолчанию) — шторка: прибита к низу, во всю ширину, выезжает
 * снизу. Компьютер (sm:) — выпадающее меню.
 *
 * Браузерные стили диалога (поля, рамка, `margin: auto`, свои max-width и
 * max-height) сброшены явно, иначе шторка не прилипает к низу. `open:flex`,
 * а не `flex`: утилита сильнее браузерного `dialog:not([open]) { display:
 * none }` и держала бы закрытое меню на экране.
 *
 * Затемнение — ink-950, а не токен темы, и так и в светлой: под шторкой
 * страница должна темнеть, а не светлеть.
 *
 * Появление — через `starting:` и allow-discrete: без него переход на
 * display не анимируется. Firefox пока так не умеет — там меню просто
 * появляется, это не поломка. Кому анимация мешает, у того её нет.
 */
export const SHEET_DIALOG_CLASS = [
  "m-0 max-w-none flex-col border-0 border-line p-0 text-fg open:flex",
  "backdrop:bg-ink-950/60 backdrop:backdrop-blur-sm",
  // Телефон: шторка
  "inset-x-0 top-auto bottom-0 max-h-[85dvh] w-full rounded-t-3xl border-t bg-surface-raised",
  "translate-y-0 starting:open:translate-y-full",
  // Компьютер: выпадающее
  "sm:bottom-auto sm:left-auto sm:max-h-[calc(100dvh-5rem)] sm:rounded-2xl sm:border sm:bg-surface-raised/90 sm:shadow-2xl sm:backdrop-blur-md sm:backdrop:bg-transparent sm:backdrop:backdrop-blur-none",
  "sm:starting:open:translate-y-0 sm:starting:open:scale-95 sm:starting:open:opacity-0",
  "origin-top-right transition-[translate,scale,opacity,display,overlay] duration-200 ease-out [transition-behavior:allow-discrete] motion-reduce:transition-none",
].join(" ");

/*
 * Прокручивается внутренний блок, а не диалог: свайп смотрит на его
 * scrollTop, и overscroll-contain не отдаёт докрутку странице.
 *
 * flex-auto, а не flex-1: у диалога нет высоты, только max-h, и основу 0%
 * Safari честно схлопывал в ноль — шторка открывалась полоской из одних
 * отступов (iPhone автора, 15 сентября 2026). Chrome в том же случае берёт
 * высоту содержимого, поэтому на Android всё выглядело верно. min-h-0
 * по-прежнему даёт сжаться до max-h и прокручиваться.
 *
 * Блоку ставят tabIndex={-1} и autoFocus: фокус при открытии — на него, а не
 * на первый пункт, иначе showModal() обводил пункт рамкой, будто его уже
 * выбрали. С клавиатуры Tab по-прежнему идёт по пунктам.
 */
export const SHEET_BODY_CLASS =
  "min-h-0 flex-auto overflow-y-auto overscroll-contain px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:p-2";

/** Ручка — знак, что шторку можно стянуть вниз. На компьютере тянуть нечего. */
export function SheetHandle() {
  return <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" />;
}

/**
 * Страница замирает, пока меню открыто: не прокручивается под шторкой и не
 * тянет браузерное «обновить», если палец ушёл на затемнение.
 * overscroll-behavior на корне — именно он выключает жест обновления в
 * Chrome на Android; overflow — прокрутку.
 */
function lockPage(on: boolean) {
  const root = document.documentElement;
  root.style.overflow = on ? "hidden" : "";
  root.style.overscrollBehavior = on ? "none" : "";
}
