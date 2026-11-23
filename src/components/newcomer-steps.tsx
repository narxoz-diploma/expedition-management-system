import Link from "@/components/link";

import { SpotsCounter } from "@/components/spots-counter";
import { buttonClass, cardClass } from "@/components/ui";
import { formatDateWithWeekday } from "@/lib/hikes/format";
import type { Hike } from "@/lib/hikes/types";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";

type StepState = "done" | "current" | "later";

/**
 * Первые шаги новичка — в ленте вошедшего, пока он не участник клуба.
 *
 * До 14 сентября 2026 гость, который ничего не заполнил и никуда не
 * записан, видел «Привет, …» и те же карточки, что на /hikes: лента не
 * подсказывала, что делать и чем это кончится. Путь при этом короткий и один
 * — профиль, поход с пометкой «Можно новичкам», сам поход, — и его стоит
 * показать целиком, с галочками, а не по одной подсказке.
 *
 * Блок исчезает сам: участником человека делает отметка лидера «Пройден», и
 * с этого момента лента обычная.
 */
export async function NewcomerSteps({
  missing,
  myHike,
  newcomerHike,
}: {
  /** Чего не хватает профилю для записи — уже словами языка страницы. */
  missing: string[];
  /** Поход, на который человек уже записан, — если есть. */
  myHike: Hike | null;
  /** Ближайший поход, открытый новичкам, из тех, куда он не записан. */
  newcomerHike: Hike | null;
}) {
  const locale = await getLocale();
  const t = getDictionary(locale).newcomer;

  const profileDone = missing.length === 0;
  const hikeDone = myHike !== null;

  const profileState: StepState = profileDone ? "done" : "current";
  const hikeState: StepState = hikeDone ? "done" : profileDone ? "current" : "later";
  const goState: StepState = hikeDone ? "current" : "later";

  return (
    <section className={cardClass({ className: "mt-6" })}>
      <h2 className="text-lg font-bold">{t.title}</h2>
      <p className="mt-1 text-fg-muted">{t.lead}</p>

      <ol className="mt-6 flex flex-col gap-6">
        <Step n={1} state={profileState} title={t.profile} doneLabel={t.done}>
          {profileDone ? (
            <Hint>{t.profileDone}</Hint>
          ) : (
            <>
              <Hint>{fill(t.profileLeft, { fields: missing.join(", ") })}</Hint>
              <Link
                href="/profile/edit?next=/"
                className={buttonClass({ variant: "primary", block: true, className: "mt-3" })}
              >
                {t.profileCta}
              </Link>
            </>
          )}
        </Step>

        <Step n={2} state={hikeState} title={t.hike} doneLabel={t.done}>
          {myHike ? (
            <>
              <Hint>
                {t.hikeMine}{" "}
                <Link
                  href={`/hikes/${myHike.slug}`}
                  className="font-semibold text-fg underline underline-offset-4"
                >
                  {myHike.routeName ?? myHike.title}
                </Link>
                , {formatDateWithWeekday(myHike.startsAt, false, locale)}.
              </Hint>
              <Link
                href="/profile/gear"
                className={buttonClass({ size: "sm", className: "mt-3" })}
              >
                {t.hikeGear}
              </Link>
            </>
          ) : newcomerHike ? (
            <>
              {/* Сам поход — внутри шага, а не «найди в ленте ниже»: из
                  двадцати карточек новичку подходят две, и искать их по
                  мелкой пометке он не обязан. */}
              <Link
                href={`/hikes/${newcomerHike.slug}`}
                className="mt-3 block rounded-xl bg-surface-raised p-4 transition-colors hover:bg-line"
              >
                <span className="block text-sm font-semibold text-fg-muted">
                  {formatDateWithWeekday(newcomerHike.startsAt, false, locale)}
                </span>
                <span className="mt-1 block font-bold text-fg">
                  {newcomerHike.routeName ?? newcomerHike.title}
                </span>
                <span className="mt-1 block">
                  <SpotsCounter hike={newcomerHike} />
                </span>
              </Link>
              {hikeState === "current" && (
                <Link
                  href={`/hikes/${newcomerHike.slug}`}
                  className={buttonClass({ variant: "primary", block: true, className: "mt-3" })}
                >
                  {t.hikeSee}
                </Link>
              )}
            </>
          ) : (
            <Hint>{t.hikeNone}</Hint>
          )}
        </Step>

        <Step n={3} state={goState} title={t.go} doneLabel={t.done}>
          <Hint>{t.goHint}</Hint>
        </Step>
      </ol>
    </section>
  );
}

function Step({
  n,
  state,
  title,
  doneLabel,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  doneLabel: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4" aria-current={state === "current" ? "step" : undefined}>
      <span
        aria-hidden
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          state === "done"
            ? "bg-success text-bg"
            : state === "current"
              ? "bg-fg text-bg"
              : "bg-surface-raised text-fg-muted"
        }`}
      >
        {state === "done" ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
        ) : (
          n
        )}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className={`font-semibold ${state === "later" ? "text-fg-muted" : "text-fg"}`}>
          {title}
          {state === "done" && <span className="sr-only">{doneLabel}</span>}
        </p>
        {/* Пояснения у всех шагов, и у будущих: путь целиком виден сразу, а
            не открывается по одному шагу. */}
        {children}
      </div>
    </li>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-fg-muted">{children}</p>;
}
