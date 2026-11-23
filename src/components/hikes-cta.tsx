"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LinkPending } from "@/components/link-pending";
import { floatingButtonClass } from "@/components/ui";
import { pathWithoutLocale } from "@/lib/i18n/locales";

/**
 * Плавающая кнопка «Посмотреть походы» для гостя.
 *
 * Заменяет собой ссылку «Походы», которая раньше висела в шапке. Она нужна
 * только гостю: у авторизованного главная и есть лента походов. Внизу справа,
 * а не в шапке — на телефоне это ближе к большому пальцу, а сайт мобильный
 * в первую очередь.
 *
 * Плавающие кнопки — первое, от чего сайт начинает выглядеть дёшево, поэтому
 * условий четыре, и все обязательные:
 *
 * 1. Только гостю (`signedIn` приходит с сервера).
 * 2. Не на страницах походов: на списке она бессмысленна, а на карточке
 *    спорила бы с «Записаться» — главным действием в теле страницы.
 * 3. Прячется, пока на экране видна собственная кнопка страницы, ведущая
 *    туда же: две одинаковые кнопки разом выглядят как ошибка вёрстки.
 *    Такие кнопки помечены `data-cta-anchor`.
 * 4. Учитывает нижнюю кромку iOS — иначе на айфоне кнопка уезжает под
 *    полосу браузера. Обнаруживается только на живом телефоне.
 */
export function HikesCta({
  signedIn,
  label,
}: {
  signedIn: boolean;
  /** Подпись кнопки на языке страницы: компонент клиентский, словарь — на сервере. */
  label: string;
}) {
  const pathname = usePathname();
  const [anchorVisible, setAnchorVisible] = useState(true);

  // Без приставки языка: иначе на /en/hikes условие не срабатывало бы, и
  // кнопка «к походам» висела бы на самом списке походов.
  const hidden = signedIn || pathWithoutLocale(pathname).startsWith("/hikes");

  useEffect(() => {
    if (hidden) return;

    const anchors = document.querySelectorAll("[data-cta-anchor]");

    // Якорей может не быть вовсе — тогда прятать плавающую кнопку не от чего
    // и она показывается сразу. Через кадр, а не сразу: setState прямо в теле
    // эффекта даёт каскадный повтор рендера, на это ругается линтер и
    // справедливо. Задержка в один кадр глазом не видна.
    if (anchors.length === 0) {
      const frame = requestAnimationFrame(() => setAnchorVisible(false));
      return () => cancelAnimationFrame(frame);
    }

    const seen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) seen.add(entry.target);
        else seen.delete(entry.target);
      }
      setAnchorVisible(seen.size > 0);
    });

    anchors.forEach((anchor) => observer.observe(anchor));
    return () => observer.disconnect();
    // pathname в зависимостях: при мягкой навигации разметка меняется, а
    // наблюдатель остаётся на узлах, которых уже нет в документе.
  }, [hidden, pathname]);

  if (hidden) return null;

  const visible = !anchorVisible;

  return (
    <>
    {/* Запас под кнопкой в самом конце страницы, после подвала: иначе,
        долистав до низа, человек не может прочитать то, что под ней лежит.
        Размытие под стеклом текст не спасает — его всё равно не прочитать. */}
    <div aria-hidden className="h-20" />
    <div
      /* bottom считается от безопасной зоны, а не от нуля: на iOS внизу
         полоса браузера, и кнопка без этого оказывается под ней. */
      className={`fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 transition-all duration-200 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
      aria-hidden={!visible}
    >
      <Link
        href="/hikes"
        tabIndex={visible ? undefined : -1}
        className={floatingButtonClass()}
      >
        {label}
        <span aria-hidden className="text-accent-500">
          →
        </span>
        <LinkPending />
      </Link>
    </div>
    </>
  );
}
