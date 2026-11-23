import Link from "@/components/link";

import { buttonClass, cardClass } from "@/components/ui";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";

/**
 * Похода по этой ссылке нет.
 *
 * Самая частая 404 на сайте, и делает её сам рабочий порядок: ссылка на поход
 * уходит в WhatsApp и живёт в чате вечно, а лидер потом убирает поход в
 * черновики или удаляет. Человек, открывший её через месяц, ни в чём не
 * виноват — и объяснять ему надо не «ошибка 404», а что произошло.
 *
 * Отсюда и три ссылки вместо одной: тому, кто пришёл по старой ссылке, нужен
 * список ближайших; тому, кто искал конкретный прошедший поход, — архив; а
 * если человек уверен, что поход есть, спрашивать он пойдёт в ленту клуба,
 * потому что больше некуда.
 *
 * Заголовок вкладки задаёт generateMetadata страницы похода («Поход не
 * найден» на языке страницы): у not-found своих метаданных по языку нет.
 */
export default async function HikeNotFound() {
  const t = getDictionary(await getLocale()).hikeNotFound;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      <div className={cardClass({ className: "mt-6" })}>
        <p className="text-fg-muted">{t.body}</p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/hikes" className={buttonClass({ variant: "primary" })}>
            {t.upcoming}
          </Link>
          <Link href="/hikes?tab=past" className={buttonClass()}>
            {t.past}
          </Link>
        </div>
      </div>

      <p className="mt-6 text-sm text-fg-muted">
        {t.ask}{" "}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent-500 underline underline-offset-4"
        >
          {INSTAGRAM_HANDLE}
        </a>
      </p>
    </main>
  );
}
