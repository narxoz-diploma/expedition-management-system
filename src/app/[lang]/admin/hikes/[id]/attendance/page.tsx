import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import {
  AttendanceRow,
  MarkAllCompletedButton,
} from "@/components/attendance-control";
import { CollapseDoneButton } from "@/components/collapse-done-button";
import { NoHikeAccess } from "@/components/no-hike-access";
import { calloutClass } from "@/components/ui";
import { canEditHike, requireStaffPage } from "@/lib/auth-guards";
import { getAttendanceRoster } from "@/lib/hikes/attendance";
import {
  attendancePhase,
  attendanceProgress,
  isSettled,
} from "@/lib/hikes/attendance-progress";
import {
  attendanceOpensAt,
  canMarkAttendance,
} from "@/lib/hikes/attendance-window";
import {
  formatDateTime,
  formatDateWithWeekday,
  pluralWithNumber,
} from "@/lib/hikes/format";
import { listHikeLeaders } from "@/lib/hikes/leaders";
import { getHikeById } from "@/lib/hikes/queries";

export const metadata = { title: "Явка", robots: { index: false } };

/**
 * Отметки явки — отдельным экраном.
 *
 * По тому же доводу, что и сборка чата: другой момент, другая поза, другие
 * данные. Явку отмечают стоя на точке сбора, одной рукой, на морозе и при
 * слабой связи; снаряжение, экстренные контакты и лист ожидания там не
 * нужны, а промотать их надо было бы двадцать пять раз.
 *
 * Отметка происходит дважды, и экран это знает. До времени выхода лидер
 * отвечает на единственный вопрос, ответ на который у него есть, — пришёл
 * человек или нет. После возвращения появляется итог и кнопка «Все дошли».
 */
export default async function HikeAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireStaffPage(`/admin/hikes/${id}/attendance`);

  const hike = await getHikeById(id);
  if (!hike) notFound();

  const leaders = await listHikeLeaders(hike.id, hike.leaderId);

  // До чтения состава, как на ростере и на сборке чата: постороннему лидеру
  // политика отдаёт только его собственную запись, и экран показал бы
  // обрезок как правду — «отмечено 0 из 1».
  if (!canEditHike(profile, hike.leaderId, leaders.map((l) => l.id))) {
    return (
      <NoHikeAccess
        what="отмечать явку на этом походе"
        leaderNames={leaders.map((l) => l.fullName)}
      />
    );
  }

  const now = new Date();
  const phase = attendancePhase(hike.startsAt, now);
  const canMark = canMarkAttendance(hike.startsAt, now);

  const people = await getAttendanceRoster(hike.id);
  const progress = attendanceProgress(
    people.map((person) => person.result),
    phase,
  );
  const arrived = people.filter((person) => person.result === "arrived");

  // Разбивка считается при загрузке, а не на каждое нажатие. Живая
  // пересортировка подтягивала бы под палец следующего человека, и на
  // двадцати пяти отметках подряд одна ушла бы не тому. Отмеченная строка
  // сжимается на месте, а вниз уезжает по «Свернуть отмеченных».
  // Граница — та же isSettled(), что у счётчика «осталось»: после выхода
  // «Пришёл» остаётся сверху, с ним ещё работать.
  const todo = people.filter((person) => !isSettled(person.result, phase));
  const settled = people.filter((person) => isSettled(person.result, phase));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink href={`/admin/hikes/${hike.id}`}>Группа похода</BackLink>

      <h1 className="mt-6 text-2xl font-bold">Явка</h1>
      <p className="mt-2 text-fg-muted">
        {hike.routeName ?? hike.title}, {formatDateWithWeekday(hike.startsAt)}
      </p>

      {hike.status === "cancelled" && (
        <p className={calloutClass({ tone: "danger", className: "mt-6 text-sm" })}>
          Поход отменён. Отметки на нём ни на что не влияют — если группа всё
          же вышла, отмечать надо на том походе, который состоялся.
        </p>
      )}

      {!canMark ? (
        // Окно открывается за два часа до выхода: до него кнопки неактивны, и
        // сказать об этом надо один раз на список, а не подписью у каждого.
        <p className={calloutClass({ tone: "warning", className: "mt-6 text-sm" })}>
          Отметить явку можно с {formatDateTime(attendanceOpensAt(hike.startsAt))}{" "}
          — за два часа до выхода.
        </p>
      ) : (
        <p className="mt-6 max-w-2xl text-fg-muted">
          {phase === "gathering"
            ? "На сборе отметь, кто на месте. Опоздавших можно отмечать ещё два часа после выхода, потом здесь же появится итог — «пройден» или «сход»."
            : "Отметь итог. «Пройден» засчитывает поход и делает новичка участником клуба — ставь его только тем, кто дошёл до конца."}
        </p>
      )}

      {people.length > 0 && (
        <section className="mt-8">
          {/* Число, ради которого на экран возвращаются. Набранное тем же
              серым, что и всё вокруг, оно теряется — на сборке чата это уже
              проходили. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-medium text-fg">
              Отмечено {progress.marked} из {progress.total}
            </p>
            {progress.unresolved > 0 && (
              <p className="text-sm text-fg-muted">
                осталось {progress.unresolved}
              </p>
            )}
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress.total - progress.unresolved}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label="Отмечено"
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className="h-full bg-success"
              style={{
                width: `${
                  progress.total === 0
                    ? 0
                    : Math.round(
                        ((progress.total - progress.unresolved) /
                          progress.total) *
                          100,
                      )
                }%`,
              }}
            />
          </div>

          {phase === "outcome" && progress.arrived > 0 && (
            <p className="mt-2 text-sm text-warning">
              {pluralWithNumber(
                progress.arrived,
                "человек отмечен",
                "человека отмечены",
                "человек отмечены",
              )}{" "}
              на сборе, но итог у них не проставлен.
            </p>
          )}
        </section>
      )}

      {/* «Все дошли» — до списка, а не после.
          Лидер открывает экран дома, уставший, ради одного действия: сказать,
          что все вернулись. Заставлять его для этого прокрутить двадцать
          пять строк значит отложить дело на завтра, а завтра он не придёт.
          Поставлено пробой: если окажется, что её жмут не глядя и потом
          правят исключения, переставить вниз — одна строка. */}
      {phase === "outcome" && arrived.length > 0 && canMark && (
        <div className="mt-6">
          <MarkAllCompletedButton
            hikeId={hike.id}
            names={arrived.map((person) => person.fullName)}
          />
        </div>
      )}

      <section className="mt-8">
        {people.length === 0 ? (
          <p className="text-fg-muted">Пока никто не записался.</p>
        ) : todo.length === 0 ? (
          <p className="text-fg-muted">Отмечать больше некого.</p>
        ) : (
          <>
            {/* Неотмеченные сверху отдельным списком. Раньше порядок был
                общий, как записывались, и на первом живом сборе
                (13 сентября 2026) неотмеченных приходилось искать глазами
                среди сжатых строк, бегая по экрану. */}
            {/* По наличию неотмеченных, а не отмеченных: разбивка считана
                при загрузке, и на свежем экране кнопка иначе появилась бы
                только после обновления — то есть когда уже не нужна. */}
            {canMark && (
              <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm text-fg-muted">
                <span>Отмеченные останутся на месте до обновления списка.</span>
                <CollapseDoneButton />
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {todo.map((person) => (
                <AttendanceRow
                  key={person.userId}
                  hikeId={hike.id}
                  userId={person.userId}
                  name={person.fullName}
                  current={person.result}
                  phase={phase}
                  canMark={canMark}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Свёрнуто нативным details, как на сборке чата: раскрыть, чтобы
          снять промах, можно без единой строчки JS и при слабой связи. */}
      {settled.length > 0 && (
        <details className="mt-8 rounded-xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer font-medium text-fg">
            Отмечены — {settled.length}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {settled.map((person) => (
              <AttendanceRow
                key={person.userId}
                hikeId={hike.id}
                userId={person.userId}
                name={person.fullName}
                current={person.result}
                phase={phase}
                canMark={canMark}
              />
            ))}
          </ul>
        </details>
      )}

      {/* Лидеры в списке не значатся: явку им никто не отмечает, их
          присутствие подтверждено тем, что они ведут. Так же было и в
          ростере, откуда кнопки сюда переехали. */}
    </main>
  );
}
