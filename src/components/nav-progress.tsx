"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { pathWithoutLocale } from "@/lib/i18n/locales";

/**
 * Полоска на нижней границе шапки, пока идёт переход.
 *
 * Между нажатием и новой страницей проходит около 0,4 секунды (замеры — в
 * docs/PERF.md), а порог, за которым человек перестаёт связывать нажатие с
 * результатом, примерно 0,3. Без отклика в этом промежутке не происходит
 * ничего, и непонятно, засчиталось ли касание.
 *
 * Слушаем клики по ссылкам, а не состояние роутера: в App Router нет событий
 * навигации, а `useLinkStatus` знает только про свою ссылку. Ловим на фазе
 * погружения, чтобы успеть раньше, чем обработчик ссылки уведёт страницу.
 */
export function NavProgress() {
  // Без приставки языка — и здесь, и в setLeaving ниже. usePathname() после
  // rewrite в proxy может отдавать внутренний /ru/…, а location.pathname —
  // адрес из браузера; сравнивая их как есть, полоска не узнала бы, что
  // страница приехала (см. pathWithoutLocale).
  const pathname = pathWithoutLocale(usePathname());

  // Храним адрес, с которого уходим, а не флаг: пока адрес прежний — переход
  // ещё идёт, сменился — значит страница приехала. Так состояние вычисляется
  // из pathname, и гасить полоску отдельным эффектом не нужно.
  const [leaving, setLeaving] = useState<string | null>(null);
  const active = leaving !== null && leaving === pathname;

  useEffect(() => {
    let stuck = 0;

    function onClick(event: MouseEvent) {
      // Клик с модификатором или не левой кнопкой открывает вкладку, а не
      // уводит эту страницу.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const link = (event.target as Element | null)?.closest?.("a");
      if (!link) return;

      // Скачивание файла страницу не меняет: адрес останется прежним, и
      // погасить полоску будет нечему. Такие ссылки помечены в разметке.
      if (link.hasAttribute("data-no-progress")) return;
      if (link.hasAttribute("download") || link.target === "_blank") return;

      // `link.href` не гарантированно валиден: например, «на карте» на
      // странице похода строится прямо из meeting_point_url, а это
      // свободный текст без проверки формата. Полоска загрузки — украшение,
      // и падать из-за чужой опечатки в ссылке ей нельзя: настоящий переход
      // браузер сделает сам, событие тут не отменяется ни в одной ветке.
      // Найдено 7 сентября 2026 на живом отчёте: SyntaxError у new URL()
      // валил всю страницу в error.tsx на самом обычном клике.
      let url: URL;
      try {
        url = new URL(link.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // Якорь на этой же странице и повторный клик по текущему адресу
      // перехода не вызывают.
      if (url.pathname === location.pathname && url.search === location.search) {
        return;
      }

      setLeaving(pathWithoutLocale(location.pathname));

      // Страховка: если переход почему-то не состоялся, адрес не сменится и
      // гасить полоску будет нечему — она останется висеть навсегда. Десять
      // секунд заведомо больше любого честного перехода (самый долгий на
      // проде — около полусекунды, см. docs/PERF.md).
      window.clearTimeout(stuck);
      stuck = window.setTimeout(() => setLeaving(null), 10_000);
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      window.clearTimeout(stuck);
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  if (!active) return null;

  return (
    <span
      aria-hidden
      className="animate-nav-progress absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent-500"
    />
  );
}
