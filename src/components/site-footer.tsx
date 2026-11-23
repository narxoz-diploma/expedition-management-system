import Link from "@/components/link";

import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { INSTAGRAM_URL } from "@/lib/site";

/**
 * Подвал: ссылки и строка клуба.
 *
 * Ссылки здесь остаются, хотя у своих те же есть в меню аккаунта: гостю меню
 * не показывается, а правила и снаряжение — самое пересылаемое после карточки
 * похода. Но знака клуба тут быть не должно, он уже есть в закреплённой шапке,
 * которая никуда не уезжает: подвал со вторым логотипом оказывался пересказом
 * шапки, да ещё и крупнее её.
 *
 * До 15 сентября 2026 подвал был одной строкой с переносом, и на телефоне
 * ссылки рвались рваными кусками по левому краю, а сам он сливался со
 * страницей (замечание автора). Теперь это блок на поверхности карточки,
 * ссылки на телефоне — ровной сеткой в две колонки, на широком — в строку.
 */
export async function SiteFooter() {
  const t = getDictionary(await getLocale()).footer;

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      {/* Нижний отступ с запасом под полоску жестов iPhone: без него
          последняя строка уходила под неё. */}
      <div className="mx-auto w-full max-w-3xl px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm">
        {/* grid, а с sm — flex: одно свойство display, но вариант в стилях
            Tailwind идёт позже базовой утилиты и побеждает. */}
        {/* Сетка заполняется по столбцам (grid-flow-col): слева справочное —
            правила и снаряжение, справа про людей — команда и инстаграм
            (решение автора, 15 сентября 2026). Порядок разметки при этом
            годится и для строки на широком экране. */}
        <nav
          aria-label={t.navLabel}
          className="grid grid-flow-col grid-cols-2 grid-rows-2 gap-x-4 sm:flex sm:flex-wrap sm:gap-x-6"
        >
          {/* min-h-tap, а не h-tap: «Правила и безопасность» в половине
              экрана телефона переносится на две строки, и жёсткая высота
              наложила бы строки на соседнюю ссылку. */}
          <Link href="/rules" className="flex min-h-tap items-center text-fg-muted hover:text-fg">
            {t.rules}
          </Link>
          <Link href="/gear-guide" className="flex min-h-tap items-center text-fg-muted hover:text-fg">
            {t.gearGuide}
          </Link>
          <Link href="/team" className="flex min-h-tap items-center text-fg-muted hover:text-fg">
            {t.team}
          </Link>
          {/*
            Внешняя ссылка, поэтому обычный `a`, а не `Link`: клиентского
            перехода тут нет и предзагружать нечего.

            Со значком, потому что среди трёх одинаково серых текстовых ссылок
            строчка терялась. Подпись при этом остаётся: один значок без слов в
            ряду из текста читается как случайно попавший сюда логотип.
            Нарисован инлайном — ради одной иконки тянуть библиотеку незачем,
            `currentColor` сам подхватывает наведение.
          */}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-tap items-center gap-2 text-fg-muted hover:text-fg"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              className="size-5 shrink-0"
            >
              <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
              <circle cx="12" cy="12" r="4.25" />
              <circle cx="17.6" cy="6.4" r="1.15" fill="currentColor" stroke="none" />
            </svg>
            Instagram
          </a>
        </nav>

        <p className="mt-3 border-t border-line pt-4 text-center text-fg-subtle sm:text-left">
          {t.club}
        </p>
      </div>
    </footer>
  );
}
