import type { Metadata } from "next";
import Link from "@/components/link";

import { buttonClass, cardClass } from "@/components/ui";
import { formatDateWithWeekday } from "@/lib/hikes/format";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { listTeam } from "@/lib/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).team;
  return { title: t.metaTitle, description: t.metaDescription };
}

/**
 * Команда клуба целиком.
 *
 * Без входа намеренно (решение автора, 14 сентября 2026): на главной эти
 * лица и роли и так видны всем, прятать нечего, а родителю и новичку до
 * записи эта страница нужнее, чем участнику, — «с кем я иду». Телефонов
 * здесь нет и не будет: их видит только лидер своего похода.
 *
 * Якорь у каждого человека — его id: на странице похода имена лидеров ведут
 * сюда, прямо к карточке.
 *
 * Подпись, «о себе» и названия маршрутов — как их написали люди, на своём
 * языке: переводятся только слова самой страницы.
 */
export default async function TeamPage() {
  const [team, locale] = await Promise.all([listTeam(), getLocale()]);
  const t = getDictionary(locale).team;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{t.title}</h1>
      <p className="mt-3 text-lg text-fg-muted">{t.lead}</p>

      {team.length === 0 ? (
        <p className="mt-8 text-fg-muted">{t.empty}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {team.map((member) => (
            <li
              key={member.id}
              id={member.id}
              /* scroll-mt: иначе закреплённая шапка закрывает имя, к которому
                 привела ссылка со страницы похода. */
              className={cardClass({ className: "scroll-mt-20" })}
            >
              <div className="flex gap-4">
                <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-surface-raised">
                  {member.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element --
                       аватары сжаты до 640px при загрузке. */
                    <img
                      src={member.avatarUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-3xl font-bold text-fg-muted">
                      {member.fullName.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg leading-tight font-bold">{member.fullName}</h2>
                  {member.clubTitle && (
                    <p className="mt-1 text-sm text-fg-muted">{member.clubTitle}</p>
                  )}
                  {member.instagram && (
                    /* Ник хранится без @ и без адреса: собрать ссылку мы
                       умеем сами, а проверить чужую — нет. */
                    <a
                      href={`https://instagram.com/${member.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex min-h-tap items-center text-sm text-accent-500 underline underline-offset-4"
                    >
                      @{member.instagram}
                    </a>
                  )}
                </div>
              </div>

              {member.bio && (
                <p className="mt-4 whitespace-pre-line text-fg-muted">{member.bio}</p>
              )}

              {/* Строками, а не оранжевыми подчёркнутыми ссылками: две-три
                  такие подряд перетягивали взгляд с лица и имени, а акцент по
                  UI.md — для действий (замечание автора, 14 сентября 2026). */}
              {member.upcoming.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-fg">{t.leads}</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {member.upcoming.map((hike) => (
                      <li key={hike.id}>
                        <Link
                          href={`/hikes/${hike.slug}`}
                          className="flex min-h-14 items-center gap-3 rounded-xl bg-surface-raised px-4 py-2 transition-colors hover:bg-line"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-fg">
                              {hike.routeName ?? hike.title}
                            </span>
                            <span className="block text-sm text-fg-muted">
                              {formatDateWithWeekday(hike.startsAt, false, locale)}
                            </span>
                          </span>
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-5 shrink-0 text-fg-muted"
                          >
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {member.recent.length > 0 && (
                <p className="mt-4 text-sm text-fg-muted">
                  {/* Без повторов: клуб ходит одними маршрутами, и
                      «Горельник, …, Горельник» читалось опечаткой. */}
                  {t.recent}{" "}
                  {member.recent.map((hike) => hike.routeName ?? hike.title).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Отсюда должен быть выход к походам: страницу смотрят, выбирая, с
          кем идти. */}
      <Link
        href="/hikes"
        data-cta-anchor
        className={buttonClass({ variant: "primary", className: "mt-10" })}
      >
        {t.ctaHikes}
      </Link>
    </main>
  );
}
