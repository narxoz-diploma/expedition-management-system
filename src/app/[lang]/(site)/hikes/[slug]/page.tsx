import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { CategoryScale } from "@/components/category-scale";
import { HikeWeather } from "@/components/hike-weather";
import { PhotoGrid } from "@/components/photo-grid";
import { RegisterButton } from "@/components/register-button";
import { RegisterJumpCta } from "@/components/register-jump-cta";
import { RouteDescription } from "@/components/route-steps";
import { SpotsCounter, TotalOnTrail, WentOnTrail } from "@/components/spots-counter";
import { buttonClass, calloutClass, cardClass } from "@/components/ui";
import {
  formatCost,
  formatDateTime,
  formatDateWithWeekday,
  formatDeadline,
  formatNumber,
  formatTime,
  pluralize,
} from "@/lib/hikes/format";
import { listHikeLeaders } from "@/lib/hikes/leaders";
import { getHikeBySlug } from "@/lib/hikes/queries";
import { getMeetingPoint } from "@/lib/hikes/meeting-point";
import { getMyRegistration } from "@/lib/hikes/registration";
import { listHikePhotos } from "@/lib/photos/queries";
import { getWaiverForms, type WaiverForms } from "@/lib/waiver-forms";
import { cancellationCutoff, isLateCancel } from "@/lib/hikes/cancel-cutoff";
import { summarizeStrikes } from "@/lib/strikes";
import { getMyStrikes } from "@/lib/strikes-queries";
import { isPastHike, spotsLeft, type Hike } from "@/lib/hikes/types";
import { WAIVER_KINDS, waiverKindForAge, type WaiverKind } from "@/lib/hikes/waiver";
import { fill, getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
import {
  ageOn,
  getCurrentProfile,
  getEmergencyContacts,
  missingFieldKeys,
} from "@/lib/profile";
import Link from "@/components/link";
import { listUpcomingHikes } from "@/lib/hikes/queries";
import { listPublicLeaders } from "@/lib/club-stats";

type HikeText = Dictionary["hike"];

/**
 * Почему записаться нельзя — или null, если можно.
 * Дублирует проверки register_for_hike(): база всё равно решит сама, но
 * человеку надо объяснить причину до нажатия, а не после.
 */
function closedReason(hike: Hike, now: Date, t: HikeText["closed"]): string | null {
  if (hike.status === "cancelled") return t.cancelled;
  if (hike.status === "completed") return t.completed;
  if (hike.status === "draft") return t.draft;
  if (now > new Date(hike.startsAt)) return t.started;
  // Без дат: у опубликованного похода они стоят строкой выше, в блоке
  // «Запись», и «Запись откроется 17 сентября» печаталось там дважды подряд.
  if (hike.registrationOpensAt && now < new Date(hike.registrationOpensAt)) {
    return t.notOpen;
  }
  if (hike.registrationClosesAt && now > new Date(hike.registrationClosesAt)) {
    return t.closed;
  }
  return null;
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [hike, locale] = await Promise.all([getHikeBySlug((await params).slug), getLocale()]);
  const t = getDictionary(locale).hike;
  if (!hike) return { title: t.metaNotFound };

  return {
    title: `${hike.routeName ?? hike.title} — ${formatDateWithWeekday(hike.startsAt, false, locale)}`,
    description:
      hike.summary ??
      fill(t.metaDescription, {
        n: hike.category,
        datetime: formatDateTime(hike.startsAt, locale),
      }),
  };
}

export default async function HikePage({ params }: Params) {
  const hike = await getHikeBySlug((await params).slug);
  if (!hike) notFound();

  // Снимки идут в общий Promise.all, в отличие от погоды: это свой запрос к
  // своей базе, а не поход в чужую сеть — задержки Open-Meteo здесь нет.
  const [
    leaders,
    registration,
    profile,
    contacts,
    photos,
    meeting,
    waiverForms,
    upcoming,
    team,
    locale,
  ] = await Promise.all([
    listHikeLeaders(hike.id, hike.leaderId),
    getMyRegistration(hike.id),
    getCurrentProfile(),
    getEmergencyContacts(),
    listHikePhotos(hike.id),
    getMeetingPoint(hike.id),
    getWaiverForms(),
    // Нужен только новичку на поход для участников — куда идти вместо
    // этого. Тот же запрос, что у ленты, дешевле отдельного условного.
    listUpcomingHikes(),
    listPublicLeaders(),
    getLocale(),
  ]);
  const dict = getDictionary(locale);
  const t = dict.hike;
  const teamIds = new Set(team.map((member) => member.id));
  // Отметки — только вошедшему: гостю записываться всё равно через вход, а
  // там его встретит тот же ответ базы.
  const strikes = summarizeStrikes(profile ? await getMyStrikes() : []);
  const strikeHikes = pluralize(strikes.hikesLeft ?? 1, dict.strikes.hikes, locale);

  const now = new Date();
  const past = isPastHike(hike, now);
  // Рубеж отмены — закрытие записи, иначе сутки до выхода. Правило в базе,
  // здесь копия, чтобы сказать о нём до нажатия.
  const cutoff = cancellationCutoff(hike);
  const afterCutoff = now > new Date(cutoff);

  const registered = registration !== null && registration.status !== "cancelled";
  const membersOnly =
    !hike.openToNewcomers &&
    (profile?.membershipStatus === "guest" || profile?.membershipStatus === "pending");
  const newcomerCandidate = membersOnly
    ? upcoming.find((other) => other.openToNewcomers && other.id !== hike.id)
    : undefined;

  // Всё про запись — одним списком у кнопки. До 14 сентября 2026
  // «Запись закрывается» и «Кто может пойти» стояли в деталях наверху, а
  // «Запись откроется» — в самом низу, и связать их было делом читателя.
  const registrationSummary =
    hike.status === "published" && !past ? (
      <dl className="flex flex-col gap-3">
        <RegistrationFact label={t.factRegistration}>
          {registrationWindow(hike, now, t, locale).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </RegistrationFact>
        <RegistrationFact label={t.factWho}>
          {hike.openToNewcomers ? t.whoNewcomers : t.whoMembers}
        </RegistrationFact>
        {/* Жёлтая плашка расписки — записавшимся, у них это главное дело.
            До записи хватает строки: скачать всё равно ещё нечего, а цвет
            тревоги на странице, где человек только выбирает, пугал. */}
        {!registered && (
          <RegistrationFact label={t.factWaiver}>{t.waiverAfter}</RegistrationFact>
        )}
        {/* Когда отказ станет поздним — до записи, а не при отмене: большая
            часть поздних отмен от незнания правила. После рубежа строка
            нужна только тем, кто держит место, — остальным отменять нечего. */}
        {!afterCutoff ? (
          <RegistrationFact label={t.factCancel}>
            {fill(t.cancelFreeUntil, { cutoff: formatDeadline(cutoff, locale) })}
          </RegistrationFact>
        ) : (
          registration?.status === "confirmed" &&
          !registration.asLeader && (
            <RegistrationFact label={t.factCancel}>{t.cancelLateNow}</RegistrationFact>
          )
        )}
      </dl>
    ) : null;

  const stats = [
    hike.distanceKm !== null && {
      label: t.distance,
      value: fill(t.km, { n: formatNumber(hike.distanceKm, locale) }),
    },
    hike.elevationGainM !== null && {
      label: t.gain,
      value: fill(t.meters, { n: hike.elevationGainM }),
    },
    hike.durationHours !== null && {
      label: t.duration,
      value: fill(t.hoursAbout, { n: formatNumber(hike.durationHours, locale) }),
    },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink href="/hikes">{t.back}</BackLink>

      {hike.status === "cancelled" && (
        <p
          role="alert"
          className={calloutClass({ tone: "danger", className: "mt-6" })}
        >
          <span className="font-semibold text-fg">{t.cancelled}</span>{" "}
          {hike.cancelledReason && (
            <span className="text-fg-muted">{hike.cancelledReason}</span>
          )}
        </p>
      )}

      {hike.status === "draft" && (
        <p className={calloutClass({ tone: "warning", className: "mt-6 text-sm" })}>
          {t.draft}
        </p>
      )}

      <p className="mt-6 font-semibold text-fg-muted">
        {fill(t.dateLine, {
          date: formatDateWithWeekday(hike.startsAt, false, locale),
          time: formatTime(hike.startsAt, locale),
        })}
      </p>
      <h1 className="mt-2 text-3xl leading-tight font-bold">
        {hike.routeName ?? hike.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <CategoryScale category={hike.category} withLabel />
        {hike.status !== "cancelled" &&
          (past ? (
            /* У состоявшегося похода свободных мест не бывает — бывает
               состав, который в него сходил. */
            <WentOnTrail hike={hike} />
          ) : (
            <>
              <SpotsCounter hike={hike} />
              {/* Места считаются по участникам, а идут ещё и лидеры. Человеку,
                  который выбирает поход, важен размер группы целиком. */}
              <TotalOnTrail hike={hike} />
            </>
          ))}
      </div>

      {/* Тексты похода — название, описание, место сбора — пишет лидер, и
          показываются они как написаны, на любом языке страницы: заставлять
          лидера писать три раза — работа, которую сайт создаёт вместо того,
          чтобы снимать (ROADMAP, «Три языка»). */}
      {hike.summary && <p className="mt-6 text-lg text-fg-muted">{hike.summary}</p>}

      {stats.length > 0 && (
        <dl className={cardClass({ className: "mt-8 grid grid-cols-2 gap-4" })}>
          {stats.map((item) => (
            <div key={item.label}>
              <dt className="text-sm text-fg-muted">{item.label}</dt>
              <dd className="mt-1 text-lg font-semibold text-fg">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="mt-8 flex flex-col gap-4">
        {/* Прошедший поход описывается в прошедшем времени: «Сбор в 08:30»
            у выхода, который был в марте, звучит как назначение встречи. */}
        {/*
          Время видно всем, место — только тем, кто идёт.

          На точку приходили мимо записи и присоединялись к группе на месте:
          лидер узнавал о таких, когда отказывать уже поздно. Прячется здесь
          только надпись — сами колонки клиенту не читаются вовсе, см.
          миграцию 20260812.

          Лист ожидания адреса не видит наравне с посторонними: место в
          группе ему ещё не досталось. Поднимут из очереди — адрес откроется
          сам, отдельного действия не нужно.
        */}
        <Detail label={past ? t.meetingPast : t.meeting}>
          {formatTime(hike.startsAt, locale)}
          {meeting.visible && meeting.point && `, ${meeting.point}`}
          {meeting.visible && meeting.url && (
            <>
              {" "}
              <a
                href={meeting.url}
                target="_blank"
                rel="noopener noreferrer"
                /* break-words: адрес карты — длинный кусок без пробелов, и
                   без переноса он утаскивает страницу вбок на 375px. */
                className="text-accent-500 underline underline-offset-4 break-words"
              >
                {t.onMap}
              </a>
            </>
          )}
          {!meeting.visible && !past && hike.status !== "cancelled" && (
            <span className="block text-fg-muted">{t.meetingHidden}</span>
          )}
        </Detail>

        {hike.costAmount !== null && (
          <Detail label={t.cost}>
            {fill(t.costAbout, { cost: formatCost(hike.costAmount, locale) })}
            {hike.costNote && <span className="text-fg-muted"> — {hike.costNote}</span>}
            <span className="block text-fg-muted">{t.costCash}</span>
          </Detail>
        )}

        {leaders.length > 0 && (
          <Detail
            label={
              past
                ? leaders.length > 1
                  ? t.ledMany
                  : t.ledOne
                : leaders.length > 1
                  ? t.leadMany
                  : t.leadOne
            }
          >
            {/* Имя — ссылкой на карточку в команде: «с кем я иду» новичок
                выясняет именно здесь. Кого нет в команде (team_order пуст),
                тот остаётся текстом — ссылка вела бы в никуда. */}
            {leaders.map((leader, index) => (
              <span key={leader.id}>
                {index > 0 && ", "}
                {teamIds.has(leader.id) ? (
                  <Link
                    href={`/team#${leader.id}`}
                    className="underline decoration-fg-muted underline-offset-4 hover:text-accent-500"
                  >
                    {leader.fullName}
                  </Link>
                ) : (
                  leader.fullName
                )}
              </span>
            ))}
          </Detail>
        )}
      </section>

      {/* Расписка сразу под условиями похода и заметным блоком.
          Бумага, о которой человек узнал у автобуса, — это бумага, которой у
          него нет: подписать её надо заранее, а несовершеннолетнему ещё и
          дать родителю. Поэтому не строчка в описании, а плашка. */}
      {!past && hike.status !== "cancelled" && registered && (
        <WaiverCallout
          slug={hike.slug}
          forms={waiverForms}
          kind={waiverKindForAge(
            profile?.birthDate ? ageOn(profile.birthDate, hike.startsAt) : null,
          )}
          canDownload={registration?.status === "confirmed"}
          t={t}
        />
      )}

      {/* Прогноз — за <Suspense>, потому что это чужая сеть: без него
          задержка Open-Meteo прилипла бы к открытию карточки, включая походы
          без координат. Пока грузится, места под него не занимаем — блок
          необязательный, и прыжок разметки хуже его отсутствия. */}
      {hike.routeLat !== null &&
        hike.routeLon !== null &&
        hike.routeAltitudeM !== null && (
          <Suspense fallback={null}>
            <HikeWeather
              lat={hike.routeLat}
              lon={hike.routeLon}
              altitudeM={hike.routeAltitudeM}
              startsAt={hike.startsAt}
              durationHours={hike.durationHours}
              now={now}
            />
          </Suspense>
        )}

      {/* Ниже описания: сначала что за маршрут, потом как он выглядел.
          Блока нет вовсе, пока нет снимков — пустой заголовок «Фотографии»
          работает против доверия сильнее, чем его отсутствие. */}
      {photos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t.photos}</h2>
          <PhotoGrid photos={photos} className="mt-4" />
        </section>
      )}

      {hike.description && (
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t.route}</h2>
          {/* Цепочка точек через тире — схемой, иначе абзацем, как раньше. */}
          <RouteDescription text={hike.description} />
        </section>
      )}

      <RegisterButton
        hikeId={hike.id}
        hikeSlug={hike.slug}
        registration={registration}
        signedIn={profile !== null}
        banned={profile?.banned ?? false}
        membersOnly={membersOnly}
        openToNewcomers={hike.openToNewcomers}
        newcomerHike={
          newcomerCandidate
            ? {
                slug: newcomerCandidate.slug,
                title: newcomerCandidate.routeName ?? newcomerCandidate.title,
                dateLabel: formatDateWithWeekday(newcomerCandidate.startsAt, false, locale),
              }
            : null
        }
        missingProfileFields={
          profile
            ? missingFieldKeys(profile, contacts).map((key) => dict.profileFields[key])
            : []
        }
        closedReason={closedReason(hike, now, t.closed)}
        past={past}
        isLateCancel={
          registration !== null &&
          registration.status !== "cancelled" &&
          isLateCancel(
            cutoff,
            { status: registration.status, spotSince: registration.spotSince },
            now,
          )
        }
        waitlistNote={
          // Отметки раньше рубежа: стоящему в очереди из-за них важнее, что
          // сама она его не поднимет ни до закрытия записи, ни после.
          strikes.restricted
            ? fill(dict.strikes.waitlistNote, { hikes: strikeHikes })
            : afterCutoff
              ? dict.register.waitlistNoteFrozen
              : dict.register.waitlistNote
        }
        confirmedNote={
          afterCutoff
            ? dict.register.confirmedNoteLate
            : fill(dict.register.confirmedNote, { cutoff: formatDeadline(cutoff, locale) })
        }
        availability={
          // С отметками на пороге место не достанется и при свободных: база
          // поставит в очередь. Кнопка говорит это до нажатия.
          strikes.restricted
            ? { full: true, note: fill(dict.strikes.registerNote, { hikes: strikeHikes }) }
            : spotsLeft(hike) > 0
            ? {
                full: false,
                note: fill(dict.register.registerNoteFree, {
                  spots: pluralize(spotsLeft(hike), dict.spots.capacity, locale),
                }),
              }
            : {
                full: true,
                note: fill(dict.register.registerNoteQueue, { n: hike.waitlistCount + 1 }),
              }
        }
        summary={registrationSummary}
        t={dict.register}
      />

      {/* Позиция в дереве не важна — кнопка `fixed`, найдёт свой якорь
          через querySelector. Стоит рядом с RegisterButton, а не в layout,
          чтобы размонтироваться и родиться заново при переходе между
          двумя разными походами. */}
      <RegisterJumpCta label={dict.register.jump} />
    </main>
  );
}

/**
 * Плашка «нужна расписка».
 *
 * Показывается всем, включая тех, кто ещё не записан: знать, что на поход
 * нужна подписанная бумага, надо до записи, а не после. Скачивание при этом
 * открыто только идущим — как и место сбора, и решает это политика бакета, а
 * не эта проверка. Здесь она нужна, чтобы не показывать ссылку, которая
 * всё равно вернёт человека обратно.
 *
 * Бланк показывается один — тот, что подходит по возрасту на день похода.
 * Дата рождения в профиле необязательна, и без неё показываются оба: выбрать
 * за человека наугад значит с какой-то вероятностью отправить
 * несовершеннолетнего в горы без согласия родителя.
 *
 * **Плашка стоит всегда, даже если бланки не загружены.** Расписка нужна на
 * каждый поход, а прежде и требование, и упоминание в анонсе появлялись
 * только вместе с файлом: лидер, забывший его приложить, оставлял участника
 * без единого упоминания о бумаге — и того разворачивали на сборе по
 * правилу, которого ему нигде не показали. Правило от наличия файла не
 * зависит и теперь показывается отдельно от него.
 *
 * Сами бланки — файлы клуба на русском, их язык страницы не меняет.
 */
function WaiverCallout({
  slug,
  forms,
  kind,
  canDownload,
  t,
}: {
  slug: string;
  forms: WaiverForms;
  kind: WaiverKind | null;
  canDownload: boolean;
  t: HikeText;
}) {
  const available = WAIVER_KINDS.filter((k) => forms[k] !== null);

  // Возраст известен и нужный бланк загружен — показываем только его.
  // Иначе честно показываем всё, что есть, с подписями.
  const show = kind && forms[kind] ? [kind] : available;
  const kindLabel: Record<WaiverKind, string> = { adult: t.waiverAdult, minor: t.waiverMinor };

  return (
    <section className={calloutClass({ tone: "warning", className: "mt-8" })}>
      <h2 className="text-xl font-bold">{t.waiverTitle}</h2>
      <p className="mt-2 text-fg-muted">{t.waiverBody}</p>

      {show.length > 1 && <p className="mt-2 text-sm text-fg-muted">{t.waiverByAge}</p>}

      {!canDownload ? (
        /* Плашку теперь видят только записавшиеся, так что без места здесь —
           лист ожидания. */
        <p className="mt-4 text-fg-muted">{t.waiverWaitlist}</p>
      ) : show.length === 0 ? (
        /* Записавшемуся, которому скачивать нечего, говорим прямо. Молчать
           тут нельзя: правило он уже прочёл, а кнопки нет — и без объяснения
           это выглядит поломкой сайта, а не забытым бланком. */
        <p className="mt-4 text-fg-muted">{t.waiverMissing}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {show.map((k) => (
            <a
              key={k}
              href={`/hikes/${slug}/waiver/${k}`}
              /* data-no-progress: ответом идёт файл, адрес страницы не
                 меняется, и гасить полоску перехода было бы нечему. */
              data-no-progress
              className={buttonClass({ variant: "primary", block: true })}
            >
              {t.waiverDownload}
              {show.length > 1 && ` — ${kindLabel[k]}`}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Окно записи — в том же порядке, в каком его проверяет база.
 *
 * Строками, а не одной фразой: «Откроется 24 сентября, 12:15, закроется
 * 26 сентября, 12:00» из четырёх запятых читалось с трудом (замечание
 * автора, 21 сентября 2026). Открытие и закрытие — по строке на каждое.
 */
function registrationWindow(hike: Hike, now: Date, t: HikeText, locale: Locale): string[] {
  const opens = hike.registrationOpensAt;
  const closes = hike.registrationClosesAt;
  const at = (iso: string) => formatDeadline(iso, locale);

  if (opens && now < new Date(opens)) {
    return [
      fill(t.windowOpens, { opens: at(opens) }),
      closes ? fill(t.windowCloses, { closes: at(closes) }) : t.windowClosesAtStart,
    ];
  }
  if (closes && now > new Date(closes)) return [t.windowClosed];
  return [closes ? fill(t.windowOpenUntil, { closes: at(closes) }) : t.windowOpenToStart];
}

function RegistrationFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-fg">{children}</dd>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line pb-4 last:border-b-0">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1 text-fg">{children}</p>
    </div>
  );
}
