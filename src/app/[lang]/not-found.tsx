import Link from "@/components/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buttonClass, cardClass } from "@/components/ui";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";

/**
 * 404 на всё, чего нет: опечатки в адресе, старые ссылки, чужие адреса.
 *
 * Шапку и подвал страница приносит с собой намеренно. Они живут не в корневом
 * layout, а в `(site)/layout.tsx`, и до этой страницы не дотягиваются — без
 * них человек оказался бы на экране вообще без единой ссылки. Тупик здесь
 * хуже, чем где-либо ещё: сюда попадают ровно те, кто уже сбился с пути.
 *
 * Стандартную страницу Next заменяем не ради красоты: она белая, английская
 * и мимо тёмной темы, то есть выглядит как чужой сайт или как поломка — и то
 * и другое хуже правды, которая всего лишь «такой страницы нет».
 *
 * Своего заголовка вкладки нет: статический был бы русским на любом языке, а
 * по языку метаданные у not-found не задаются. Заголовок — из корневого
 * layout, на языке страницы.
 */
export default async function NotFound() {
  const t = getDictionary(await getLocale()).notFound;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold">{t.title}</h1>

        <div className={cardClass({ className: "mt-6" })}>
          <p className="text-fg-muted">{t.body}</p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href="/hikes" className={buttonClass({ variant: "primary" })}>
              {t.upcoming}
            </Link>
            <Link href="/" className={buttonClass()}>
              {t.home}
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
