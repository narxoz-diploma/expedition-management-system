import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { ChatParticipantRow } from "@/components/chat-participant-row";
import { CollapseDoneButton } from "@/components/collapse-done-button";
import { NoHikeAccess } from "@/components/no-hike-access";
import { calloutClass } from "@/components/ui";
import { canEditHike, requireStaffPage } from "@/lib/auth-guards";
import {
  formatDateTime,
  formatDateWithWeekday,
  pluralWithNumber,
} from "@/lib/hikes/format";
import { getChatRoster } from "@/lib/hikes/chat";
import { listHikeLeaders } from "@/lib/hikes/leaders";
import { getHikeById } from "@/lib/hikes/queries";
import type { Hike } from "@/lib/hikes/types";
import { formatPhone } from "@/lib/phone";

/**
 * Сборка чата похода в WhatsApp.
 *
 * Отдельной страницей, а не блоком в ростере: лидер уходит в WhatsApp и
 * возвращается на каждого человека, и проматывать снаряжение, отметки явки и
 * экстренные контакты двадцать пять раз — это ровно та работа, ради экономии
 * которой экран и сделан.
 *
 * Ссылки на чат здесь нет и не будет. Ссылка-приглашение уходит по рукам, и
 * в чате оказывается кто угодно; добавление по номеру из ростера личность
 * подтверждает само — номер взят из профиля того, кто записался.
 */
export default async function HikeChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireStaffPage(`/admin/hikes/${id}/chat`);

  const hike = await getHikeById(id);
  if (!hike) notFound();

  const leaders = await listHikeLeaders(hike.id, hike.leaderId);

  // До чтения состава, как и на ростере: постороннему лидеру политика отдаёт
  // только его собственную запись, и страница показала бы обрезок как правду.
  if (!canEditHike(profile, hike.leaderId, leaders.map((l) => l.id))) {
    return (
      <NoHikeAccess
        what="собирать чат этого похода"
        leaderNames={leaders.map((l) => l.fullName)}
      />
    );
  }

  const roster = await getChatRoster(hike.id, profile.id);
  const now = new Date();
  const stillOpen = registrationOpen(hike, now);
  const past = now > new Date(hike.startsAt);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink href={`/admin/hikes/${hike.id}`}>Группа похода</BackLink>

      <h1 className="mt-6 text-2xl font-bold">Чат похода</h1>
      <p className="mt-2 text-fg-muted">
        {hike.routeName ?? hike.title}, {formatDateWithWeekday(hike.startsAt)}
      </p>

      {/* Свёрнуто: инструкция нужна при первой сборке, а дальше пять строк
          над списком мешали каждый раз. */}
      <details className="mt-4 max-w-2xl rounded-2xl bg-surface px-4 py-2">
        <summary className="flex min-h-tap cursor-pointer items-center font-semibold text-fg">
          Как собирать чат
        </summary>
        <p className="pb-3 text-fg-muted">
          Группу заводи в WhatsApp сам, а людей добавляй отсюда по одному:
          нажатие на номер копирует его и отмечает строку. Кого добавить не
          дадут — тем «Написать» и ссылку на группу в личку; когда такой
          человек зайдёт, отметь его кнопкой «Зашёл».
        </p>
      </details>

      {stillOpen && (
        <p className={calloutClass({ tone: "warning", className: "mt-6 text-sm" })}>
          Запись ещё открыта{hike.registrationClosesAt &&
            ` — до ${formatDateTime(hike.registrationClosesAt)}`}
          . Состав пока меняется, и собранный сейчас чат придётся дополнять.
        </p>
      )}

      {/* Только до выхода: после похода чат отработал, и красный блок
          «убрать» тревожил ни о чём. */}
      {roster.toRemove.length > 0 && !past && (
        <section className={calloutClass({ tone: "danger", className: "mt-6" })}>
          <h2 className="font-medium text-fg">
            Убрать из чата —{" "}
            {pluralWithNumber(
              roster.toRemove.length,
              "человек",
              "человека",
              "человек",
            )}
          </h2>
          {/* Сайт из WhatsApp никого не удалит — он может только сказать
              кого. Номер здесь затем, что в группе людей ищут по нему:
              имя в WhatsApp человек пишет какое хочет. */}
          <p className="mt-2 text-sm text-fg-muted">
            Отменили запись уже после того, как попали в чат. Удалить их из
            группы придётся руками.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {roster.toRemove.map((person) => (
              <li key={person.userId} className="text-sm text-fg">
                {person.fullName}
                {person.phone && (
                  <span className="whitespace-nowrap text-fg-muted"> · {formatPhone(person.phone)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Прогресс, а не строчка текста: «18 из 25» — единственное число,
          ради которого на экран возвращаются, и набранное тем же серым, что
          и всё остальное, оно терялось. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="font-medium text-fg">
            {roster.done.length} из {roster.total} в чате
          </p>
          {roster.active.length > 0 && (
            <p className="text-sm text-fg-muted">
              осталось {roster.active.length}
            </p>
          )}
        </div>
        <div
          role="progressbar"
          aria-valuenow={roster.done.length}
          aria-valuemin={0}
          aria-valuemax={roster.total}
          aria-label="Собрано в чат"
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
        >
          <div
            className="h-full bg-success"
            style={{
              width: `${roster.total === 0 ? 0 : Math.round((roster.done.length / roster.total) * 100)}%`,
            }}
          />
        </div>
        {roster.waiting.length > 0 && (
          <p className="mt-2 text-sm text-warning">
            {pluralWithNumber(
              roster.waiting.length,
              "человек ждёт",
              "человека ждут",
              "человек ждут",
            )}
            , что зайдут по ссылке.
          </p>
        )}
      </section>

      <section className="mt-10">
        {/* Заголовок не называет состояние людей в списке.
            «Ещё не в чате» врал ровно с той секунды, как лидер кого-то
            отмечал: отмеченная строка остаётся здесь до обновления, и
            подпись под заголовком говорит об этом прямо, вместо того чтобы
            выдавать это за порядок вещей. */}
        <h2 className="text-xl font-bold">
          {roster.active.length === 0 ? "Все в чате" : "Собираем чат"}
        </h2>
        {roster.active.length > 0 && (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-fg-muted">
            <span>Отмеченные останутся на месте до обновления списка.</span>
            <CollapseDoneButton />
          </p>
        )}
        {/* «Все в чате» уже сказано заголовком и счётчиком — третьей строки
            «Добавлять больше некого» не нужно. */}
        {roster.active.length === 0 ? (
          roster.total === 0 && (
            <p className="mt-4 text-fg-muted">Пока никто не записался.</p>
          )
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {roster.active.map((person) => (
              <ChatParticipantRow
                key={person.userId}
                hikeId={hike.id}
                userId={person.userId}
                name={person.fullName}
                phone={person.phone}
                current={person.chatStatus}
                since={person.chatStatusAt}
                unaware={person.unaware}
                isLeader={person.asLeader}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Свёрнуто нативным details: раскрытие без единой строчки JS, и оно
          работает, пока страница ещё не ожила. Разбивка считается при
          загрузке — отмеченная сейчас строка остаётся на месте до следующего
          захода, иначе она уезжала бы из-под пальца в момент нажатия. */}
      {roster.done.length > 0 && (
        <details className="mt-10 rounded-2xl bg-surface px-4 py-2">
          <summary className="flex min-h-tap cursor-pointer items-center font-semibold text-fg">
            В чате — {roster.done.length}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {roster.done.map((person) => (
              <ChatParticipantRow
                key={person.userId}
                hikeId={hike.id}
                userId={person.userId}
                name={person.fullName}
                phone={person.phone}
                current={person.chatStatus}
                since={person.chatStatusAt}
                unaware={person.unaware}
                isLeader={person.asLeader}
              />
            ))}
          </ul>
        </details>
      )}

      {/* Лист ожидания в чат не идёт вовсе: там те, кто идёт. Стоящий в
          очереди попадёт сюда, если место освободится, — уже с пометкой
          «ещё не знает». */}
    </main>
  );
}

/**
 * Запись ещё идёт — значит состав будет меняться.
 *
 * Повторяет проверки register_for_hike(), как и closedReason() на карточке
 * похода: решает всё равно база, но лидеру надо сказать заранее, что
 * собранный сейчас чат придётся дополнять.
 */
function registrationOpen(hike: Hike, now: Date): boolean {
  if (hike.status !== "published") return false;
  if (now > new Date(hike.startsAt)) return false;
  if (hike.registrationClosesAt && now > new Date(hike.registrationClosesAt)) {
    return false;
  }
  return true;
}
