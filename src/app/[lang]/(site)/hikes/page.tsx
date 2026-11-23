import type { Metadata } from "next";
import Link from "@/components/link";

import { HikeCard } from "@/components/hike-card";
import { buttonClass, cardClass } from "@/components/ui";
import { listPastHikes, listUpcomingHikes } from "@/lib/hikes/queries";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { listHikeCovers } from "@/lib/photos/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).hikesList;
  return { title: t.metaTitle, description: t.metaDescription };
}

type Tab = "upcoming" | "past";

export default async function HikesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab: Tab = (await searchParams).tab === "past" ? "past" : "upcoming";
  const [hikes, locale] = await Promise.all([
    tab === "past" ? listPastHikes() : listUpcomingHikes(),
    getLocale(),
  ]);
  const t = getDictionary(locale).hikesList;
  // Одним запросом на всю страницу: по одному на карточку дало бы двадцать
  // походов в базу ради картинок.
  const covers = await listHikeCovers(hikes.map((hike) => hike.id));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{t.title}</h1>

      <nav className="mt-6 flex gap-2" aria-label={t.tabsLabel}>
        <TabLink href="/hikes" active={tab === "upcoming"}>
          {t.upcoming}
        </TabLink>
        <TabLink href="/hikes?tab=past" active={tab === "past"}>
          {t.past}
        </TabLink>
      </nav>

      {hikes.length === 0 ? (
        /* Пустая вкладка отправляет на соседнюю: чаще всего человек пришёл по
           ссылке из чата в паузу между походами, и уходить ему рано. */
        <div className={cardClass({ className: "mt-10" })}>
          <p className="text-fg-muted">
            {tab === "upcoming" ? t.emptyUpcoming : t.emptyPast}
          </p>
          <Link
            href={tab === "upcoming" ? "/hikes?tab=past" : "/hikes"}
            className={buttonClass({ className: "mt-4" })}
          >
            {tab === "upcoming" ? t.toPast : t.toUpcoming}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {hikes.map((hike) => (
            <li key={hike.id}>
              <HikeCard hike={hike} cover={covers.get(hike.id) ?? null} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // Вкладка — переключатель, а не главное действие: залитая акцентом,
      // она спорила с единственной главной кнопкой экрана.
      className={buttonClass({ size: "sm", selected: active })}
    >
      {children}
    </Link>
  );
}
