import Link from "@/components/link";

import { Chip } from "@/components/chip";
import { HikeCard } from "@/components/hike-card";
import { Landing } from "@/components/landing";
import { NewcomerSteps } from "@/components/newcomer-steps";
import { buttonClass, calloutClass } from "@/components/ui";
import { getClubStats, listPublicLeaders } from "@/lib/club-stats";
import { listUpcomingHikes } from "@/lib/hikes/queries";
import { listMyHikes } from "@/lib/hikes/registration";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { listHeroPhotos, listHikeCovers, listRecentPhotos } from "@/lib/photos/queries";
import { getCurrentProfile, getEmergencyContacts, missingFieldKeys } from "@/lib/profile";

/**
 * Главная ведёт себя по-разному: гостю нужен лендинг, своему — лента
 * ближайших походов. Показывать участнику рекламу клуба, в котором он уже
 * состоит, значит заставлять его каждый раз прокручивать её до расписания.
 */
export default async function Home() {
  // Оба запроса пускаем разом, а не по очереди. Ближайшие походы нужны в
  // любой из двух веток, и ждать ради них профиль незачем: раньше это был
  // лишний круг до базы на каждом открытии главной.
  const upcomingPromise = listUpcomingHikes();
  const profile = await getCurrentProfile();
  const upcoming = await upcomingPromise;

  if (!profile) {
    // На лендинге хватает трёх ближайших: остальное — по ссылке.
    const shown = upcoming.slice(0, 3);
    const [stats, leaders, heroPhotos, gallery, covers] = await Promise.all([
      getClubStats(),
      listPublicLeaders(),
      listHeroPhotos(),
      listRecentPhotos(),
      listHikeCovers(shown.map((hike) => hike.id)),
    ]);
    return (
      <Landing
        stats={stats}
        leaders={leaders}
        upcoming={shown}
        heroPhotos={heroPhotos}
        gallery={gallery}
        covers={covers}
      />
    );
  }

  const [contacts, mine, locale] = await Promise.all([
    getEmergencyContacts(),
    listMyHikes(),
    getLocale(),
  ]);
  const dict = getDictionary(locale);
  const t = dict.home;

  // Обложки сразу для обоих списков на экране — своих походов и ближайших.
  const covers = await listHikeCovers([
    ...mine.upcoming.map((item) => item.hike.id),
    ...upcoming.map((hike) => hike.id),
  ]);
  const missing = missingFieldKeys(profile, contacts).map((key) => dict.profileFields[key]);
  const myHikeIds = new Set(mine.upcoming.map((item) => item.hike.id));
  // Гость и ожидающий подтверждения видят путь новичка вместо плашки про
  // профиль: заполнить профиль — только первый из трёх шагов.
  const isNewcomer =
    profile.membershipStatus === "guest" || profile.membershipStatus === "pending";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">
        {fill(t.greeting, { name: profile.fullName.trim().split(/\s+/)[0] })}
      </h1>

      {isNewcomer ? (
        <NewcomerSteps
          missing={missing}
          myHike={
            mine.upcoming.find((item) => item.hike.status !== "cancelled")?.hike ?? null
          }
          newcomerHike={
            upcoming.find((hike) => hike.openToNewcomers && !myHikeIds.has(hike.id)) ??
            null
          }
        />
      ) : missing.length > 0 && (
        <div className={calloutClass({ tone: "warning", className: "mt-6" })}>
          <p className="font-medium text-fg">{t.incompleteTitle}</p>
          <p className="mt-2 text-sm text-fg-muted">
            {fill(t.incompleteBody, { fields: missing.join(", ") })}
          </p>
          <Link
            href="/profile/edit"
            className={buttonClass({ variant: "primary", block: true, className: "mt-4" })}
          >
            {t.completeCta}
          </Link>
        </div>
      )}

      {mine.upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t.youGo}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {mine.upcoming.map((item) => (
              <li key={item.hike.id}>
                <HikeCard
                  hike={item.hike}
                  cover={covers.get(item.hike.id) ?? null}
                  status={
                    item.status === "confirmed" ? (
                      <Chip tone="success">{dict.myStatus.confirmed}</Chip>
                    ) : (
                      <Chip tone="warning">
                        {item.waitlistPos
                          ? fill(dict.myStatus.waitlistPos, { n: item.waitlistPos })
                          : dict.myStatus.waitlist}
                      </Chip>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-bold">{t.upcoming}</h2>
        {upcoming.filter((hike) => !myHikeIds.has(hike.id)).length === 0 ? (
          /* Пустой список — не тупик: человеку, который зашёл в неудачный
             момент, нужно куда-то идти дальше, иначе он просто закроет сайт. */
          <div className="mt-4">
            <p className="text-fg-muted">
              {upcoming.length === 0 ? t.emptyNone : t.emptyAllMine}
            </p>
            <Link
              href={upcoming.length === 0 ? "/hikes?tab=past" : "/profile/gear"}
              className={buttonClass({ className: "mt-4" })}
            >
              {upcoming.length === 0 ? t.pastLink : t.checkGear}
            </Link>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {upcoming
              .filter((hike) => !myHikeIds.has(hike.id))
              .map((hike) => (
                <li key={hike.id}>
                  <HikeCard hike={hike} cover={covers.get(hike.id) ?? null} />
                </li>
              ))}
          </ul>
        )}
      </section>
    </main>
  );
}
