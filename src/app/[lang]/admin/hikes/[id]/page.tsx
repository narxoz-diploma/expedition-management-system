import Link from "@/components/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import {
  ExcuseStrikeButton,
  RemoveParticipantButton,
  TakeFromWaitlistButton,
} from "@/components/attendance-control";
import { CancelHikeControl } from "@/components/cancel-hike-control";
import { Chip } from "@/components/chip";
import { CopyButton } from "@/components/copy-button";
import { HikePhotosEditor } from "@/components/hike-photos-editor";
import {
  DeleteDraftControl,
  PublishHikeButton,
  UnpublishHikeControl,
} from "@/components/hike-status-controls";
import { NoHikeAccess } from "@/components/no-hike-access";
import { buttonClass, calloutClass, cardClass, type ChipTone } from "@/components/ui";
import { canEditHike, requireStaffPage } from "@/lib/auth-guards";
import { fitnessShort } from "@/lib/fitness";
import type { GearOwnership } from "@/lib/gear-readiness";
import { buildAnnounce, buildCancellationAnnounce } from "@/lib/hikes/announce";
import {
  formatDateTime,
  formatDateWithWeekday,
  pluralWithNumber,
} from "@/lib/hikes/format";
import {
  attendancePhase,
  attendanceProgress,
} from "@/lib/hikes/attendance-progress";
import { attendanceOpensAt, canMarkAttendance } from "@/lib/hikes/attendance-window";
import { hubPhase, type HubPhase } from "@/lib/hikes/hub-phase";
import { listHikeLeaders } from "@/lib/hikes/leaders";
import { getMeetingPoint } from "@/lib/hikes/meeting-point";
import { getHikeById } from "@/lib/hikes/queries";
import { getRoster, type RosterEntry } from "@/lib/hikes/roster";
import { cancellationCutoff } from "@/lib/hikes/cancel-cutoff";
import { spotsLeft, type Hike } from "@/lib/hikes/types";
import { waSpotOfferUrl } from "@/lib/wa-greeting";
import { getHikeExcuses, getStrikeSettings } from "@/lib/strikes-queries";
import { formatPhone } from "@/lib/phone";
import { listHikePhotos } from "@/lib/photos/queries";
import { getSiteUrl } from "@/lib/site";

export const metadata = { title: "Группа", robots: { index: false } };

/**
 * Экран группы — по фазам похода.
 *
 * До 14 сентября 2026 он был одинаковым в любой момент жизни похода: анонс,
 * выгрузка, чат, явка, состав, фото и отмена — всегда все и в одном порядке.
 * У прошедшего оставались «Снять с похода» и плашка про согласие родителей, у
 * будущего — загрузка фотографий, у черновика не было кнопки публикации.
 * Решение автора — полностью по фазам (lib/hikes/hub-phase.ts): наверху дело
 * текущей фазы, остального в ней нет. Довод против — «кнопки переезжают,
 * лидер запомнил, где что» — автор снял сам.
 */
export default async function HikeRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireStaffPage(`/admin/hikes/${id}`);

  const hike = await getHikeById(id);
  if (!hike) notFound();

  const leaders = await listHikeLeaders(hike.id, hike.leaderId);

  // Проверка нужна именно здесь, до чтения ростера.
  //
  // Политика registrations_read отдаёт постороннему лидеру только его
  // собственную запись — база в этом права. Но страница показывала длину
  // этого урезанного списка как «Идут — 1 из 10», то есть выдавала обрезок
  // за правду. Молча недосчитаться людей хуже, чем честно отказать.
  if (!canEditHike(profile, hike.leaderId, leaders.map((l) => l.id))) {
    return (
      <NoHikeAccess
        what="смотреть эту группу"
        leaderNames={leaders.map((l) => l.fullName)}
      />
    );
  }

  const now = new Date();
  const hub = hubPhase(hike, now);
  // По часам, а не по фазе: день выхода длится ещё два часа после старта
  // (сбор с опоздавшими), но снимать с похода, отменять его и собирать чат
  // после старта уже незачем.
  const beforeStart =
    (hub === "recruiting" || hub === "departure") &&
    now.getTime() < new Date(hike.startsAt).getTime();
  const canMark = canMarkAttendance(hike.startsAt, now);
  const phase = attendancePhase(hike.startsAt, now);
  // После закрытия записи очередь сама не двигается: освободившееся место
  // стоит, пока лидер не возьмёт кого-то руками.
  const queueFrozen = now > new Date(cancellationCutoff(hike));
  const freeSpots = spotsLeft(hike);
  // Очередь нужна и в первые часы после выхода: человек из неё может прийти
  // на сбор, и взять его — тот же случай.
  const showWaitlist = beforeStart || hub === "departure";
  const offer = {
    title: hike.routeName ?? hike.title,
    dateLabel: formatDateWithWeekday(hike.startsAt),
  };

  const [roster, strikeSettings, excuses] = await Promise.all([
    getRoster(hike.id, hike.startsAt, hike.category),
    getStrikeSettings(),
    getHikeExcuses(hike.id),
  ]);
  // Кто получил отметку на этом походе — лидеру снять её, если причина
  // уважительная. Снятые лидером записи и отмены из очереди сюда не попадают:
  // отметок за них не бывает (cancelled_by_leader, was_late_cancel).
  const offenders = [
    ...roster.cancelled
      .filter((entry) => entry.wasLateCancel && !entry.cancelledByLeader)
      .map((entry) => ({ entry, kind: "late_cancel" as const })),
    ...roster.confirmed
      .filter((entry) => entry.attendance === "no_show")
      .map((entry) => ({ entry, kind: "no_show" as const })),
  ];
  const photos = await listHikePhotos(hike.id);
  // Лидеру адрес отдаётся всегда — он же его и писал. Проверку делает база:
  // доступ определяется составом похода, а не тем, что мы на экране админки.
  const meeting = await getMeetingPoint(hike.id);
  const minors = roster.confirmed.filter((entry) => entry.isMinor);
  // Отметки живут на своём экране, а здесь — только их счёт: сколько
  // осталось, видно до перехода.
  const attendance = attendanceProgress(
    roster.confirmed.map((entry) => entry.attendance),
    phase,
  );
  const gearSummary = summarizeGear(roster.confirmed);
  // Участники в любом статусе, без лидеров: от них зависит, можно ли
  // удалить черновик (delete_draft_hike() считает так же).
  const participantsCount =
    roster.confirmed.length + roster.waitlist.length + roster.cancelled.length;
  const chip = hubChip(hub, hike.status);

  // Состояние явки одной строкой. Жёлтым — только то, к чему лидер обязан
  // вернуться.
  const attendanceHint: { text: string; warn: boolean } =
    roster.confirmed.length === 0
      ? { text: "пока некого отмечать", warn: false }
      : !canMark
        ? {
            text: `откроется ${formatDateTime(attendanceOpensAt(hike.startsAt))}`,
            warn: false,
          }
        : attendance.unresolved > 0
          ? phase === "outcome" && attendance.arrived > 0
            ? {
                text: `итог не проставлен у ${attendance.unresolved} — без «Пройден» новичок не станет участником`,
                warn: true,
              }
            : {
                text: `отмечено ${attendance.marked} из ${attendance.total}`,
                warn: true,
              }
          : { text: "отмечено у всех", warn: false };

  // Анонс — дело набора. У черновика ссылка ведёт в никуда для всех, кроме
  // лидеров; в день выхода звать уже поздно.
  const announce =
    hub === "recruiting"
      ? buildAnnounce(hike, `${await getSiteUrl()}/hikes/${hike.slug}`, meeting)
      : null;

  // Отменённый поход показывает не анонс, а объявление об отмене: это его
  // единственное оставшееся дело — сказать группе.
  const cancellation = hub === "cancelled" ? buildCancellationAnnounce(hike) : null;

  const outcomePending =
    hub === "outcome" && roster.confirmed.length > 0 && attendance.unresolved > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink href="/admin/hikes">Походы</BackLink>

      {/* Статус и путь на публичную страницу — первой строкой: без статуса
          черновик, набор и прошедший поход выглядели одинаково, а с
          публичной страницы сюда и отсюда туда пройти было нельзя. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Chip tone={chip.tone}>{chip.label}</Chip>
        <Link
          href={`/hikes/${hike.slug}`}
          className="inline-flex min-h-tap items-center text-sm font-semibold text-fg-muted hover:text-fg"
        >
          Страница похода ↗
        </Link>
      </div>

      <h1 className="mt-3 text-2xl font-bold">{hike.routeName ?? hike.title}</h1>
      <p className="mt-2 text-fg-muted">
        {formatDateWithWeekday(hike.startsAt)}, выход в{" "}
        {formatDateTime(hike.startsAt).split(", ")[1]}
        {meeting.point && ` · ${meeting.point}`}
      </p>

      {hub !== "cancelled" && <PhaseSteps current={hub} />}

      {/* ---------- Главное дело фазы ---------- */}

      {hub === "draft" && (
        <section className={cardClass({ className: "mt-8" })}>
          <h2 className="text-lg font-bold">Черновик</h2>
          <p className="mt-2 text-fg-muted">
            Участники поход не видят. Проверь страницу похода и публикуй —
            запись откроется по датам из формы.
          </p>
          <div className="mt-4">
            <PublishHikeButton hikeId={hike.id} />
          </div>
        </section>
      )}

      {/*
        Анонс — главное дело набора и единственная акцентная кнопка фазы.

        По PRD §9 именно эта кнопка решает, станут ли другие лидеры
        пользоваться сайтом: сообщение в группу лидер напишет в любом случае,
        и вопрос только в том, напишет он его руками или получит готовым.
        Текст цитирует живые числа — «свободно N мест из M», — и копировать
        его надо там, где эти числа видны.
      */}
      {announce && (
        <section className={cardClass({ className: "mt-8" })}>
          <h2 className="text-lg font-bold">Анонс для WhatsApp</h2>
          <p className="mt-2 text-fg-muted">
            Свободные места посчитаны на сейчас — зовёшь ещё раз, зайди сюда
            снова.
          </p>

          {/* Текст на виду, а не только в буфере. Во встроенном браузере
              мессенджера копирование может не сработать — там же, откуда
              лидер и копирует, — и тогда единственный выход выделить его
              руками. Заодно видно, что именно уйдёт в чат. */}
          {/* break-words обязателен: в анонс попадает ссылка на точку сбора,
              а это один длинный кусок без пробелов. Без переноса он уезжает
              за край и тянет за собой всю страницу — на 375px проверено,
              было 502px прокрутки вбок. */}
          <p className="mt-4 rounded-xl bg-surface-raised p-4 text-sm break-words whitespace-pre-line text-fg-muted">
            {announce}
          </p>

          <CopyButton
            text={announce}
            label="Скопировать анонс"
            copiedLabel="Скопировано — вставляй в группу"
            className={buttonClass({
              variant: "primary",
              block: true,
              className: "mt-4",
            })}
          />
        </section>
      )}

      {hub === "departure" && (
        <section className={cardClass({ className: "mt-8" })}>
          <h2 className="text-lg font-bold">День выхода</h2>
          {/* Свободное место при живой очереди — первое, что лидер должен
              увидеть: сайт его больше не заполнит, а до выхода считанные
              часы. */}
          {queueFrozen && freeSpots > 0 && roster.waitlist.length > 0 && (
            <p className={calloutClass({ tone: "warning", compact: true, className: "mt-3 text-sm" })}>
              Свободно мест: {freeSpots}, в очереди {roster.waitlist.length}.
              Очередь сама не двигается —{" "}
              <a href="#waitlist" className="underline underline-offset-4">
                напиши и возьми из неё
              </a>
              .
            </p>
          )}
          {canMark ? (
            <>
              <p className="mt-2 text-fg-muted">
                Отметь, кто пришёл на сбор. Сейчас {attendanceHint.text}.
              </p>
              <Link
                href={`/admin/hikes/${hike.id}/attendance`}
                className={buttonClass({ variant: "primary", block: true, className: "mt-4" })}
              >
                Отметить явку
              </Link>
            </>
          ) : (
            /* До открытия отметок главное — список: на маршруте связи нет,
               и скачать его надо, пока она есть. */
            <>
              <p className="mt-2 text-fg-muted">
                Скачай список, пока есть связь: на маршруте её нет. В файле
                группа и контакты на случай ЧП. Отметки явки откроются{" "}
                {formatDateTime(attendanceOpensAt(hike.startsAt))}.
              </p>
              <a
                href={`/admin/hikes/${hike.id}/export`}
                data-no-progress
                className={buttonClass({ variant: "primary", block: true, className: "mt-4" })}
              >
                Скачать список XLSX
              </a>
            </>
          )}
        </section>
      )}

      {hub === "outcome" && (
        <section className={cardClass({ className: "mt-8" })}>
          {outcomePending ? (
            <>
              <h2 className="text-lg font-bold">Отметь итог</h2>
              <p className={`mt-2 ${attendanceHint.warn ? "text-warning" : "text-fg-muted"}`}>
                {sentence(attendanceHint.text)}. «Пройден» засчитывает поход и
                делает новичка участником клуба.
              </p>
              <Link
                href={`/admin/hikes/${hike.id}/attendance`}
                className={buttonClass({ variant: "primary", block: true, className: "mt-4" })}
              >
                Отметить итог
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold">Поход состоялся</h2>
              <p className="mt-2 text-fg-muted">
                {roster.confirmed.length === 0
                  ? "Участников на нём не было."
                  : "Итог отмечен у всех."}
                {photos.length === 0 &&
                  " Осталось добавить фотографии — первая станет обложкой похода."}
              </p>
            </>
          )}
        </section>
      )}

      {cancellation && (
        <section className={calloutClass({ tone: "danger", className: "mt-8" })}>
          <h2 className="text-lg font-bold">Поход отменён</h2>
          <p className="mt-2 text-fg-muted">
            Осталось сказать группе. Записи участников на месте — по ним видно,
            кого предупредить.
          </p>

          <p className="mt-4 rounded-xl bg-surface-raised p-4 text-sm break-words whitespace-pre-line text-fg-muted">
            {cancellation}
          </p>

          <CopyButton
            text={cancellation}
            label="Скопировать объявление"
            copiedLabel="Скопировано — вставляй в группу"
            className={buttonClass({
              variant: "primary",
              block: true,
              className: "mt-4",
            })}
          />
        </section>
      )}

      {/* ---------- Остальные дела фазы ---------- */}

      {hub !== "cancelled" && (
        <nav
          aria-label="Действия с походом"
          className="mt-4 divide-y divide-line rounded-2xl bg-surface px-4"
        >
          {/* Явка — отдельным экраном: её отмечают стоя на морозе, и
              снаряжение с контактами там только мешают. Строкой — когда она не
              главное дело фазы: до открытия отметок и после итога. */}
          {hub === "departure" && !canMark && (
            <ActionRow
              href={`/admin/hikes/${hike.id}/attendance`}
              title="Явка"
              hint={attendanceHint.text}
            />
          )}
          {hub === "outcome" && !outcomePending && roster.confirmed.length > 0 && (
            <ActionRow
              href={`/admin/hikes/${hike.id}/attendance`}
              title="Явка"
              hint="отмечено у всех — поправить, если ошибся"
            />
          )}
          {/* Сборка чата — отдельным экраном: там лидер уходит в WhatsApp и
              возвращается на каждого человека. Нужна, пока поход впереди. */}
          {beforeStart && (
            <ActionRow
              href={`/admin/hikes/${hike.id}/chat`}
              title="Собрать чат"
              hint="добавить группу в WhatsApp по одному"
            />
          )}
          {/* data-no-progress: ответ — файл, адрес страницы не меняется. */}
          {(hub === "recruiting" || (hub === "departure" && canMark)) && (
            <ActionRow
              href={`/admin/hikes/${hike.id}/export`}
              download
              title="Скачать список XLSX"
              hint={
                hub === "recruiting"
                  ? "накануне выхода: на маршруте нет связи"
                  : "группа и контакты на случай ЧП"
              }
            />
          )}
          <ActionRow
            href={`/admin/hikes/${hike.id}/edit`}
            title="Править поход"
            hint="дата, сбор, места, описание и кто ведёт"
          />
        </nav>
      )}

      {/* Фотографии после похода — сразу за делами: за ними и приходят. */}
      {hub === "outcome" && <HikePhotosEditor hikeId={hike.id} photos={photos} />}

      {/* Согласие родителей нужно до выхода; после — это шум. */}
      {beforeStart && minors.length > 0 && (
        <p className={calloutClass({ tone: "warning", className: "mt-8 text-sm" })}>
          В группе{" "}
          {pluralWithNumber(
            minors.length,
            "несовершеннолетний",
            "несовершеннолетних",
            "несовершеннолетних",
          )}
          . Нужно согласие родителя, контакт есть в списке.
        </p>
      )}

      {/* ---------- Группа ---------- */}

      {/* Лидеры — одним блоком. Раньше их было два: «Ведут» карточками сверху
          и «Кто ведёт» именами в самом низу, со ссылкой на правку. */}
      {roster.leaders.length > 0 && (
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 className="text-xl font-bold">Ведут — {roster.leaders.length}</h2>
            <Link
              href={`/admin/hikes/${hike.id}/edit`}
              className="inline-flex min-h-tap items-center text-sm font-semibold text-accent-500"
            >
              Изменить состав
            </Link>
          </div>
          <p className="text-fg-muted">Мест участников не занимают.</p>
          <ul className="mt-4 flex flex-col gap-4">
            {roster.leaders.map((entry) => (
              <Participant
                key={entry.userId}
                entry={entry}
                hikeId={hike.id}
                category={hike.category}
                showGear={false}
                canRemove={false}
                queueFrozen={queueFrozen}
              />
            ))}
          </ul>
        </section>
      )}

      {(hub !== "draft" || participantsCount > 0) && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">
            {beforeStart
              ? `Идут — ${roster.confirmed.length} из ${hike.capacity}`
              : `Были записаны — ${roster.confirmed.length}`}
          </h2>
          {beforeStart && (
            <p className="mt-1 text-fg-muted">
              Всего на маршруте {roster.confirmed.length + roster.leaders.length}
              {roster.leaders.length > 0 && " вместе с лидерами"}.
            </p>
          )}
          {/* Сводка, чтобы масштаб был виден до прокрутки: в группе на
              двадцать человек проблема иначе находится только перелистыванием.
              После выхода снаряжение уже не собрать — сводка не нужна. */}
          {beforeStart && gearSummary && (
            <p className="mt-1 text-fg-muted">Снаряжение: {gearSummary}.</p>
          )}
          {roster.confirmed.length === 0 ? (
            <p className="mt-3 text-fg-muted">
              {beforeStart ? "Пока никто не записался." : "Никто не был записан."}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {roster.confirmed.map((entry) => (
                <Participant
                  key={entry.userId}
                  entry={entry}
                  hikeId={hike.id}
                  category={hike.category}
                  showGear={beforeStart}
                  canRemove={beforeStart}
                  queueFrozen={queueFrozen}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {showWaitlist && roster.waitlist.length > 0 && (
        <section id="waitlist" className="mt-10 scroll-mt-4">
          <h2 className="text-xl font-bold">
            Лист ожидания — {roster.waitlist.length}
          </h2>
          <p className="mt-1 text-fg-muted">
            {!queueFrozen
              ? "Поднимаются автоматически, когда освобождается место."
              : freeSpots > 0
                ? `Запись закрыта, очередь сама не двигается. Свободно мест: ${freeSpots} — напиши человеку и возьми, когда подтвердит. Порядок не важен.`
                : "Запись закрыта, очередь сама не двигается. Освободится место — возьмёшь отсюда."}
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {roster.waitlist.map((entry) => (
              <Participant
                key={entry.userId}
                entry={entry}
                hikeId={hike.id}
                category={hike.category}
                waiting
                showGear
                canRemove={beforeStart}
                queueFrozen={queueFrozen}
                take={queueFrozen && freeSpots > 0 ? offer : null}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Отметки за этот поход — в любой фазе: поздние отмены случаются до
          выхода, неявки — на сборе, а узнаёт лидер о причине и позже. Пока
          дата отсчёта в настройках не вписана, отметки ни на что не влияют,
          и блока нет. */}
      {strikeSettings?.active && offenders.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Отметки за этот поход</h2>
          <p className="mt-1 text-fg-muted">
            Поздняя отмена — {pluralWithNumber(strikeSettings.lateCancelWeight, "отметка", "отметки", "отметок")},
            неявка — {pluralWithNumber(strikeSettings.noShowWeight, "отметка", "отметки", "отметок")}.
            Заболел, что-то случилось — сними отметку, сайт этого не знает.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {offenders.map(({ entry, kind }) => (
              <li
                key={`${entry.userId}:${kind}`}
                className={cardClass({ dense: true, className: "flex flex-wrap items-center justify-between gap-x-4 gap-y-1" })}
              >
                <span className="text-fg">
                  {entry.fullName}
                  <span className="ml-2 text-sm text-fg-muted">
                    {kind === "no_show" ? "неявка" : "поздняя отмена"}
                  </span>
                </span>
                <ExcuseStrikeButton
                  hikeId={hike.id}
                  userId={entry.userId}
                  kind={kind}
                  excused={excuses.has(`${entry.userId}:${kind}`)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Отменившиеся — свёрнуто: это не участники, действий с ними нет, а
          список бывает длиннее самой группы (на «Горельнике» — 23 против 20).
          Нужны до выхода — убрать человека из чата похода; после — нет. */}
      {beforeStart && roster.cancelled.length > 0 && (
        <details className="mt-10 rounded-2xl bg-surface px-4 py-3">
          <summary className="flex min-h-tap cursor-pointer items-center font-semibold text-fg">
            Отменились — {roster.cancelled.length}
          </summary>
          <p className="text-sm text-fg-muted">
            Мест не занимают. Из чата похода их надо убрать руками — сайт из
            WhatsApp никого не удаляет.
          </p>
          <ul className="mt-3 flex flex-col gap-3 pb-2">
            {roster.cancelled.map((entry) => (
              <li key={entry.userId}>
                <p className="font-medium text-fg">{entry.fullName}</p>
                <p className="mt-0.5 text-sm text-fg-muted">
                  {/* Без рода: «Отменил 13 сентября» стояло у всех подряд. */}
                  {entry.cancelledAt
                    ? `Отмена ${formatDateTime(entry.cancelledAt)}`
                    : "Отмена записи"}
                  {entry.phone && (
                    <span className="whitespace-nowrap">
                      {" · "}
                      {formatPhone(entry.phone)}
                    </span>
                  )}
                </p>
                {/* Поздняя отмена — не упрёк, а факт для набора следующей
                    группы. «Убран лидером» — чтобы снятие не читалось как
                    отказ самого человека: до 21 сентября 2026 их было не
                    отличить. */}
                {entry.cancelledByLeader ? (
                  <p className="mt-0.5 text-sm text-fg-muted">Убран лидером.</p>
                ) : (
                  entry.wasLateCancel && (
                    <p className="mt-0.5 text-sm text-warning">
                      Поздняя — после закрытия записи.
                    </p>
                  )
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Обложку можно поставить и заранее — но это не дело набора, поэтому
          внизу, а не наверху, как после похода. */}
      {(hub === "draft" || hub === "recruiting") && (
        <HikePhotosEditor hikeId={hike.id} photos={photos} />
      )}

      {/* ---------- Опасные действия ---------- */}

      {hub === "draft" && (
        <section className="mt-10 border-t border-line pt-6">
          {participantsCount === 0 && photos.length === 0 ? (
            <DeleteDraftControl hikeId={hike.id} />
          ) : (
            <p className="text-sm text-fg-muted">
              {participantsCount > 0
                ? "Удалить нельзя: на этот поход уже записывались. Он останется черновиком — участники его не видят."
                : "Чтобы удалить черновик, сначала убери его фотографии."}
            </p>
          )}
        </section>
      )}

      {beforeStart && (
        /* Разный вес и воздух между ними: снятие с публикации обратимо и
           касается только сайта, отмена — насовсем и для всей группы. Две
           одинаковые красные кнопки вплотную читались как одно и то же
           (замечание автора, 14 сентября 2026). */
        <section className="mt-14 flex flex-col gap-8 border-t border-line pt-8">
          {hub === "recruiting" && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-fg-muted">
                Вернуть в черновики — поход пропадёт из списка, опубликовать
                можно снова.
              </p>
              <UnpublishHikeControl hikeId={hike.id} />
            </div>
          )}
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-fg-muted">
              Отменить для всей группы — насовсем, вернуть кнопкой нельзя.
            </p>
            <CancelHikeControl hikeId={hike.id} />
          </div>
        </section>
      )}
    </main>
  );
}

const STEPS: { phase: Exclude<HubPhase, "cancelled">; label: string }[] = [
  { phase: "draft", label: "Черновик" },
  { phase: "recruiting", label: "Набор" },
  { phase: "departure", label: "День выхода" },
  { phase: "outcome", label: "Итог" },
];

/** Полоска фаз: где поход сейчас и что его ждёт. */
function PhaseSteps({ current }: { current: Exclude<HubPhase, "cancelled"> }) {
  const index = STEPS.findIndex((step) => step.phase === current);

  return (
    <ol aria-label="Этап похода" className="mt-5 grid grid-cols-4 gap-1.5">
      {STEPS.map((step, i) => (
        <li key={step.phase} aria-current={i === index ? "step" : undefined}>
          <span
            className={`block h-1 rounded-full ${
              i < index ? "bg-fg-muted" : i === index ? "bg-accent-500" : "bg-surface-raised"
            }`}
          />
          <span
            className={`mt-1.5 block text-xs font-semibold ${
              i === index ? "text-fg" : "text-fg-muted"
            }`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Чип статуса по фазе: у прошедшего без итога — жёлтый, к нему надо вернуться. */
function hubChip(hub: HubPhase, status: Hike["status"]): { label: string; tone: ChipTone } {
  switch (hub) {
    case "draft":
      return { label: "Черновик", tone: "accent" };
    case "recruiting":
      return { label: "Идёт набор", tone: "success" };
    case "departure":
      return { label: "День выхода", tone: "accent" };
    case "outcome":
      return status === "completed"
        ? { label: "Прошёл", tone: "neutral" }
        : { label: "Нужен итог", tone: "warning" };
    case "cancelled":
      return { label: "Отменён", tone: "danger" };
  }
}

/** Первая буква заглавная — подсказка явки пишется со строчной для строк списка. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Одна строка сводки по снаряжению, или null, если говорить не о чем.
 *
 * Каждый человек попадает ровно в одну корзину, по убыванию важности:
 * пересекающиеся счётчики в сводке читаются хуже, чем отсутствие сводки.
 */
function summarizeGear(entries: RosterEntry[]): string | null {
  let missing = 0;
  let promised = 0;
  let unknown = 0;

  for (const entry of entries) {
    if (entry.gear === null) unknown += 1;
    else if (entry.gear.missing.length > 0) missing += 1;
    else if (entry.gear.promised.length > 0) promised += 1;
  }

  const parts = [
    missing > 0 && `без обязательного — ${missing}`,
    promised > 0 && `обещают достать — ${promised}`,
    unknown > 0 && `не заполняли — ${unknown}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

/** Подписи владения — в ростере, а не в анкете: там формулировки от лица человека. */
const OWNERSHIP_LABELS: Record<GearOwnership, string> = {
  own: "есть",
  will_get: "достанет",
  none: "нет",
};

/**
 * Строка участника.
 *
 * Серверный компонент: телефон и контакты на случай ЧП рендерятся здесь и в
 * клиентский бандл не уезжают. Клиентские только кнопки, и они получают
 * идентификаторы, а не данные.
 */
function Participant({
  entry,
  hikeId,
  category,
  waiting = false,
  showGear,
  canRemove,
  queueFrozen,
  take = null,
}: {
  entry: RosterEntry;
  hikeId: string;
  category: number;
  waiting?: boolean;
  /** У лидеров и после выхода не показываем: собрать рюкзак уже поздно. */
  showGear: boolean;
  /**
   * Обязательный, а не с умолчанием: «Снять с похода» стояло у каждого
   * участника прошедшего похода, и забытый аргумент вернул бы его туда.
   */
  canRemove: boolean;
  /** Очередь стоит: снятие участника место никому не отдаёт само. */
  queueFrozen: boolean;
  /**
   * Человек в очереди, а место свободно и само не займётся: «Написать» с
   * готовым вопросом и «Взять в группу» после ответа.
   */
  take?: { title: string; dateLabel: string } | null;
}) {
  return (
    <li className={cardClass({ dense: true })}>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <span className="font-medium text-fg">
          {waiting && entry.waitlistPos && (
            <span className="mr-2 text-fg-muted">{entry.waitlistPos}.</span>
          )}
          {entry.fullName}
        </span>
        {entry.phone && (
          <a
            href={`tel:${entry.phone}`}
            /* Высота под палец, а не строки текста: номер набирают на сборе
               одной рукой, а голая ссылка высотой в строку вставала вплотную
               к номеру на случай ЧП под ней, если имя не переносилось. */
            className="inline-flex min-h-tap items-center whitespace-nowrap text-sm text-accent-500 underline underline-offset-4"
          >
            {formatPhone(entry.phone)}
          </a>
        )}
      </div>

      {/*
        Снаружи — только то, что лидер ищет, пролистывая список: исключения.
        Он сканирует группу в поисках проблем, а не подтверждений, и на
        двадцати пяти карточках курс, опыт и полный набор снаряжения
        превращались в стену, в которой не видно ни одной из них.

        Плашки «нужен родитель» у лидера нет: для ведущего она ничего не
        значит (решение автора, 14 сентября 2026).
      */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-muted">
        {entry.isMinor && !entry.asLeader && (
          <span className="font-medium text-warning">
            {entry.ageOnHike} лет — нужен родитель
          </span>
        )}
        {entry.noShowCount > 0 && <span>неявок: {entry.noShowCount}</span>}
        {/* Отметки — вместо старого счётчика поздних отмен. «Только
            очередь» жёлтым: это значит, что человек стоит в очереди не по
            номеру, и поднять его может только лидер. */}
        {entry.strikes.restricted ? (
          <span className="font-medium text-warning">
            только очередь
            {entry.strikes.hikesLeft !== null &&
              ` — ещё ${pluralWithNumber(entry.strikes.hikesLeft, "поход", "похода", "походов")}`}
          </span>
        ) : (
          entry.strikes.total > 0 && <span>отметок: {entry.strikes.total}</span>
        )}
      </div>

      {/*
        Строка про снаряжение есть всегда, даже когда всё в порядке.

        Раньше у собранного человека не появлялось ничего, и «всё есть» было
        неотличимо от «строка не отрисовалась». Пустота — плохой способ
        сказать «проверено».
      */}
      {showGear &&
        (entry.gear === null ? (
          <p className="mt-2 text-sm text-fg-muted">Снаряжение не заполнено</p>
        ) : entry.gear.missing.length > 0 ? (
          <p className="mt-2 text-sm text-fg">
            Не хватает для {category} категории:{" "}
            {entry.gear.missing.join(", ").toLowerCase()}
          </p>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">
            Снаряжение: всё есть для {category} категории
          </p>
        ))}

      {entry.emergencyContacts.length > 0 && (
        /* Снаружи и не мелким: это читают в поле, в спешке и часто при
           плохом свете — единственная строка в ростере, от которой может
           зависеть много. Под «Подробнее» ей не место по той же причине.

           Номер ссылкой tel:, как и основной: в ту минуту, когда его
           набирают, лишнее переписывание цифр с экрана — не мелочь. */
        <p className="mt-1 text-fg-muted">
          На случай ЧП:{" "}
          {entry.emergencyContacts.map((contact, index) => (
            <span key={contact.phone}>
              {index > 0 && "; "}
              {contact.fullName}
              {contact.isParent && " (родитель)"},{" "}
              {/* nowrap: без него номер рвётся посередине — «+7» остаётся
                  на строке, остальное уезжает вниз. Переносить должно имя,
                  а не цифры, которые в эту минуту набирают. */}
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex min-h-tap items-center whitespace-nowrap text-accent-500 underline underline-offset-4"
              >
                {formatPhone(contact.phone)}
              </a>
            </span>
          ))}
        </p>
      )}

      {/*
        Всё остальное — под нажатие. Данные уже здесь, раскрытие ничего не
        запрашивает: ростер открывают на точке сбора, где связь слабее всего.
      */}
      <details className="mt-2">
        <summary className="inline-flex h-tap cursor-pointer items-center text-sm text-fg-muted underline underline-offset-4">
          Подробнее
        </summary>

        <div className="flex flex-col gap-2 pb-2 text-sm text-fg-muted">
          <p className="flex flex-wrap gap-x-3">
            {entry.studyYear && <span>{entry.studyYear} курс</span>}
            {entry.manualOverride && <span>записан вручную</span>}
          </p>

          <p>
            Форма:{" "}
            {fitnessShort(entry.fitnessLevel) ?? "не указана"}
          </p>

          {/* Опыт до клуба — не у лидеров: своих лидер знает, а вот
              незнакомый новичок в списке из двадцати человек это ровно тот
              случай, ради которого поле и заводилось. */}
          {!entry.asLeader && (
            <p>Где был: {entry.visitedPlaces || "не заполнено"}</p>
          )}

          {showGear && entry.gear && (
            <div>
              <p>
                {/* Ноль — не категория: «до 0 категории» печаталось тем,
                    кому не хватает даже на первую. */}
                {entry.gear.readyUpTo === 0
                  ? "Не собран даже на 1 категорию"
                  : `Снаряжён до ${entry.gear.readyUpTo} категории`}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {entry.gear.items.map((item) => (
                  <li key={item.name}>
                    {item.name} — {OWNERSHIP_LABELS[item.ownership]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {/* Лидера снимает не эта кнопка: его запись держится составом похода,
          и отмена по ней всё равно упрётся в LEADER_REGISTRATION. */}
      {take && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {entry.phone && (
            <a
              href={waSpotOfferUrl(entry.phone, entry.fullName, take)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Написать
            </a>
          )}
          <TakeFromWaitlistButton hikeId={hikeId} userId={entry.userId} />
        </div>
      )}

      {canRemove && !entry.asLeader && (
        <div className="mt-3">
          <RemoveParticipantButton
            hikeId={hikeId}
            userId={entry.userId}
            name={entry.fullName}
            queueFrozen={queueFrozen}
          />
        </div>
      )}
    </li>
  );
}

/**
 * Строка списка действий на экране группы: название, подсказка и стрелка.
 *
 * Вся строка — одна цель нажатия высотой 56px, а не текст с кнопкой внутри:
 * экран открывают на сборе, одной рукой. У выгрузки вместо стрелки значок
 * скачивания — она отдаёт файл, а не открывает экран.
 */
function ActionRow({
  href,
  title,
  hint,
  warn = false,
  download = false,
}: {
  href: string;
  title: string;
  hint: string;
  /** Подсказка жёлтым — к этому лидер обязан вернуться. */
  warn?: boolean;
  download?: boolean;
}) {
  const className =
    "flex min-h-14 items-center justify-between gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

  const content = (
    <>
      <span className="min-w-0">
        <span className="block font-semibold text-fg">{title}</span>
        <span className={`block text-sm ${warn ? "text-warning" : "text-fg-muted"}`}>
          {hint}
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
        {download ? <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /> : <path d="m9 6 6 6-6 6" />}
      </svg>
    </>
  );

  return download ? (
    <a href={href} data-no-progress className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
