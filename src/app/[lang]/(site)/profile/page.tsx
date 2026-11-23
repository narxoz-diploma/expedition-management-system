import type { Metadata } from "next";
import Link from "@/components/link";
import { redirect } from "next/navigation";

import { AvatarUpload } from "@/components/avatar-upload";
import { Chip } from "@/components/chip";
import { HikeCard } from "@/components/hike-card";
import { buttonClass, calloutClass, cardClass } from "@/components/ui";
import { iLeadFutureHike } from "@/app/actions/account";
import { DeleteAccount } from "@/components/delete-account";
import { TeamCardForm } from "@/components/team-card-form";
import { getMyTeamCard } from "@/lib/team";
import { gearReadyUpTo, listMyGear } from "@/lib/gear";
import { formatDate, pluralize } from "@/lib/hikes/format";
import { listMyHikes } from "@/lib/hikes/registration";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { localizeHref } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";
import { getCurrentProfile, getEmergencyContacts, missingFieldKeys } from "@/lib/profile";
import { summarizeStrikes } from "@/lib/strikes";
import { getMyStrikes } from "@/lib/strikes-queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).profile;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function ProfilePage() {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  if (!profile) redirect(localizeHref("/login?next=/profile", locale));

  const dict = getDictionary(locale);
  const t = dict.profile;

  const [contacts, { upcoming, past }, gear, strikes] = await Promise.all([
    getEmergencyContacts(),
    listMyHikes(),
    listMyGear(),
    getMyStrikes(),
  ]);
  const strikeSummary = summarizeStrikes(strikes);
  const gearReady = gearReadyUpTo(gear);
  // Спрашиваем заранее: сказать «сначала передай поход» до нажатия честнее,
  // чем показать кнопку и ответить отказом после подтверждения.
  const leadsFuture = await iLeadFutureHike();
  const teamCard =
    profile.role === "leader" || profile.role === "admin"
      ? await getMyTeamCard(profile.id)
      : null;

  const missing = missingFieldKeys(profile, contacts).map((key) => dict.profileFields[key]);
  const fitness =
    profile.fitnessLevel === 1 || profile.fitnessLevel === 2 || profile.fitnessLevel === 3
      ? dict.fitnessLevels[profile.fitnessLevel]
      : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{profile.fullName}</h1>
      <p className="mt-2 text-fg-muted">
        {t.membership[profile.membershipStatus]}
        {profile.membershipStatus === "guest" && t.guestNote}
      </p>

      {/* Фото сразу под именем, а не в конце: лидеры ставят сюда портрет,
          который потом виден на лендинге, и искать его в подвале профиля
          они бы не стали. */}
      <div className="mt-6">
        <AvatarUpload
          userId={profile.id}
          avatarUrl={profile.avatarUrl}
          fullName={profile.fullName}
          t={dict.avatar}
        />
      </div>

      {missing.length > 0 && (
        <div className={calloutClass({ tone: "warning", className: "mt-6" })}>
          <p className="font-medium text-fg">{dict.home.incompleteTitle}</p>
          <p className="mt-2 text-sm text-fg-muted">
            {fill(dict.home.incompleteBody, { fields: missing.join(", ") })}
          </p>
          <Link
            href="/profile/edit"
            className={buttonClass({ variant: "primary", block: true, className: "mt-4" })}
          >
            {dict.home.completeCta}
          </Link>
        </div>
      )}

      {/* Отметки — только когда они есть: пустой блок «Отметок нет» читался
          бы как упрёк тому, кто ничего не нарушал. Наверху, рядом с
          незаполненным профилем: и то и другое мешает записаться. */}
      {strikes.length > 0 && (
        <section
          className={
            strikeSummary.restricted
              ? calloutClass({ tone: "warning", className: "mt-6" })
              : cardClass({ className: "mt-6" })
          }
        >
          <h2 className="font-bold">
            {strikeSummary.restricted ? dict.strikes.restrictedTitle : dict.strikes.title}
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            {strikeSummary.restricted
              ? fill(dict.strikes.restrictedBody, {
                  hikes: pluralize(strikeSummary.hikesLeft ?? 1, dict.strikes.hikes, locale),
                })
              : dict.strikes.lead}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-fg">
            {strikes.map((strike) => (
              <li key={`${strike.hikeId}:${strike.kind}`}>
                {fill(dict.strikes.row, {
                  kind: strike.kind === "no_show" ? dict.strikes.noShow : dict.strikes.late,
                  hike: strike.hikeTitle,
                  date: formatDate(strike.hikeStartsAt, locale),
                  hikes: pluralize(strike.remaining, dict.strikes.hikes, locale),
                })}
              </li>
            ))}
          </ul>
          <Link
            href="/rules#cancellations"
            className="mt-3 inline-flex min-h-tap items-center text-sm text-accent-500 underline underline-offset-4"
          >
            {dict.strikes.rulesLink}
          </Link>
        </section>
      )}

      <section className={cardClass({ className: "mt-8" })}>
        {/* -mr-4 гасит собственные отступы кнопки: без них область нажатия
            была 20px по высоте вместо сорока четырёх. */}
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-bold">{t.data}</h2>
          <Link
            href="/profile/edit"
            // secondary, а не ghost: ghost — для «отмены» и «назад» (UI.md §5),
            // и серый текст без фона не читался нажимаемым (скриншот автора,
            // 15 сентября 2026).
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            {t.edit}
          </Link>
        </div>

        {/* Данные профиля — содержимое, а не подпись: телефон и контакт на
            случай ЧП человек приходит сюда прочитать. */}
        <dl className="mt-4 flex flex-col gap-3">
          <Row label={t.phone}>{profile.phone ? formatPhone(profile.phone) : "—"}</Row>
          <Row label={t.studyYear}>{profile.studyYear ?? "—"}</Row>
          {/* Своей формулировкой, а не коротким ярлыком из ростера: человек
              читает здесь то, что сам про себя выбрал. */}
          <Row label={t.fitness}>{fitness ?? "—"}</Row>
          {/* Не «—», а приглашение: пустая строка тут ничего не значит для
              самого человека, а для лидера, к которому он записался, значит
              многое. Один раз попросить стоит. */}
          <Row label={t.visited}>
            {profile.visitedPlaces ?? <span className="text-fg-muted">{t.visitedEmpty}</span>}
          </Row>
          <Row label={t.emergency}>
            {contacts[0] ? (
              <>
                {contacts[0].fullName},{" "}
                {/* nowrap: иначе номер рвётся посередине — «+7» остаётся
                    на строке, а цифры уезжают вниз. */}
                <span className="whitespace-nowrap">
                  {formatPhone(contacts[0].phone)}
                </span>
              </>
            ) : (
              "—"
            )}
          </Row>
        </dl>

        <p className="mt-4 text-fg-muted">{t.privacy}</p>
      </section>

      <Link
        href="/profile/gear"
        className={cardClass({
          className:
            "mt-4 flex items-center justify-between gap-4 hover:border-accent-500",
        })}
      >
        <span>
          <span className="block font-bold text-fg">{t.gear}</span>
          <span className="mt-1 block text-sm text-fg-muted">
            {gearReady === 0 ? t.gearEmpty : fill(t.gearReady, { n: gearReady })}
          </span>
        </span>
        <span aria-hidden className="text-fg-muted">
          →
        </span>
      </Link>

      {/* Только у лидеров и админа: на странице команды бывают только они.
          Сразу после данных и снаряжения — это тоже «про себя». */}
      {teamCard && (
        <section className={cardClass({ className: "mt-4" })}>
          <h2 className="font-bold">{t.teamCard}</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">{t.teamCardNote}</p>
          <TeamCardForm bio={teamCard.bio} instagram={teamCard.instagram} t={dict.teamCard} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold">{t.upcoming}</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-fg-muted">
            {t.noRegistrations}{" "}
            <Link href="/hikes" className="text-accent-500 underline underline-offset-4">
              {t.browseHikes}
            </Link>
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {upcoming.map((item) => (
              <li key={item.hike.id}>
                {/* У отменённого не пишем ни «Ты записан», ни очередь:
                    зелёная строка над карточкой с пометкой «Отменён» — это
                    два противоположных ответа на один вопрос. */}
                <HikeCard
                  hike={item.hike}
                  status={
                    item.hike.status === "cancelled" ? (
                      <Chip tone="danger">{t.hikeCancelled}</Chip>
                    ) : item.status === "confirmed" ? (
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
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">{t.past}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {past.map((item) => (
              <li key={item.hike.id}>
                <HikeCard hike={item.hike} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Внизу, а не под фото: до 14 сентября 2026 «У меня есть код клуба»
          стояла выше данных и снаряжения — второстепенное для гостя раньше
          главного. Код нужен тем, кто в клубе давно, а таких среди гостей
          единицы. */}
      {(profile.membershipStatus === "guest" ||
        profile.membershipStatus === "pending") && (
        <section className="mt-10">
          <p className="text-sm text-fg-muted">
            {profile.membershipStatus === "pending" ? t.pendingNote : t.guestCodeNote}
          </p>
          <Link
            href="/profile/join"
            className={buttonClass({ size: "sm", className: "mt-3" })}
          >
            {profile.membershipStatus === "pending" ? t.pendingCta : t.guestCodeCta}
          </Link>
        </section>
      )}

      {/* В самом низу и без заголовка-предупреждения: это не то, к чему
          человека ведут, но и не то, что он должен искать письмом лидеру.
          Срок хранения назван здесь же — согласие на него ссылается. */}
      <section className="mt-10 border-t border-line pt-6">
        <p className="text-sm text-fg-muted">{t.retention}</p>
        <div className="mt-3">
          <DeleteAccount leadsFutureHike={leadsFuture} t={dict.deleteAccount} />
        </div>
      </section>
    </main>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  );
}
