"use client";

import Link from "@/components/link";
import { useState, useTransition } from "react";

import {
  cancelMyRegistration,
  registerForHike,
  type RegistrationResult,
} from "@/app/actions/registrations";
import { LinkPending } from "@/components/link-pending";
import { buttonClass, calloutClass, cardClass } from "@/components/ui";
import { registrationCta } from "@/lib/hikes/registration-cta";
import type { MyRegistration } from "@/lib/hikes/registration";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { fill } from "@/lib/i18n/fill";

const PRIMARY = buttonClass({ variant: "primary", block: true });
const DANGER = buttonClass({ variant: "danger", block: true });

export type NewcomerHikeLink = { slug: string; title: string; dateLabel: string };

export function RegisterButton({
  hikeId,
  hikeSlug,
  registration,
  signedIn,
  banned,
  membersOnly,
  openToNewcomers,
  newcomerHike,
  missingProfileFields,
  closedReason,
  isLateCancel,
  confirmedNote,
  waitlistNote,
  past,
  availability,
  summary,
  t,
}: {
  hikeId: string;
  hikeSlug: string;
  registration: MyRegistration | null;
  signedIn: boolean;
  /** Поход уже состоялся: записываться некуда. */
  past: boolean;
  /** Запись закрыта самому человеку, а не походу. */
  banned: boolean;
  /** Вошедший не участник, а поход закрыт для новичков. */
  membersOnly: boolean;
  openToNewcomers: boolean;
  /** Ближайший поход, открытый новичкам, — куда идти вместо этого. */
  newcomerHike: NewcomerHikeLink | null;
  /** Чего не хватает профилю — уже словами языка страницы. */
  missingProfileFields: string[];
  /** Причина закрытой записи — уже на языке страницы. */
  closedReason: string | null;
  isLateCancel: boolean;
  /**
   * Пояснение под «Место за тобой»: до рубежа — до какого времени отменять
   * без последствий, после — «всё равно отмени». Собрано на сервере: там
   * формат даты и сам рубеж.
   */
  confirmedNote: string;
  /**
   * Пояснение под «Лист ожидания»: до рубежа очередь двигается сама, после —
   * только руками лидера, и обещать «поднимешься автоматически» уже нельзя.
   */
  waitlistNote: string;
  /**
   * Место или очередь — сказать до нажатия, а не после. До 18 сентября 2026
   * кнопка у всех говорила «Записаться», и тот, кому не хватило места,
   * узнавал про очередь уже записавшись. Это прогноз на момент открытия
   * страницы: решает всё равно register_for_hike(), и если место уйдёт за
   * эту минуту, блок после нажатия покажет очередь — честно, хоть и позже.
   * Пояснение собрано на сервере: склонение числа живёт в format.ts.
   */
  availability: { full: boolean; note: string };
  /**
   * Всё про запись одним списком: окно, кто может пойти, расписка.
   * Рисуется на сервере. До 14 сентября 2026 это было в двух концах
   * страницы: «Запись закрывается» в деталях сверху, «Запись откроется» у
   * кнопки внизу.
   */
  summary: React.ReactNode;
  /** Кусок словаря пропсом: компонент клиентский, словарь целиком — на сервере. */
  t: Dictionary["register"];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const backHere = `/hikes/${hikeSlug}`;

  function run(action: () => Promise<RegistrationResult>) {
    setResult(null);
    startTransition(async () => {
      setResult(await action());
    });
  }

  /*
   * Какую из веток показать, решает registrationCta() — порядок веток и есть
   * вся логика этого блока, и ошибались в нём уже трижды. В вёрстке этот
   * порядок держался «в голове» и ломался при каждой правке; теперь он
   * держится тестами, см. lib/hikes/registration-cta.ts.
   */
  const state = registrationCta({
    past,
    signedIn,
    banned,
    membersOnly,
    registration,
    closedReason,
    missingProfileFields,
  });

  // Прошедший поход — страница-портфолио, и блок «записаться нельзя» на ней
  // только шумит.
  if (state.kind === "none") return null;

  // Лидер уже в группе — его записал состав похода. Кнопки отмены здесь нет
  // намеренно: cancel_registration такую запись не отменит (LEADER_REGISTRATION),
  // потому что иначе человек остался бы лидером на карточке и пропал из
  // ростера. Уходит он через состав, на экране правки.
  if (state.kind === "leader") {
    return (
      <Wrap summary={summary} heading={t.heading}>
        <Headline tone="success">{t.leaderTitle}</Headline>
        <Note>{t.leaderNote}</Note>
      </Wrap>
    );
  }

  // Причина бана не показывается намеренно, см. BANNED в lib/db-errors.ts.
  if (state.kind === "banned") {
    return (
      <Wrap summary={summary} heading={t.heading}>
        <Headline>{t.bannedTitle}</Headline>
        <Note>{t.bannedNote}</Note>
      </Wrap>
    );
  }

  if (state.kind === "membersOnly") {
    return (
      <Wrap summary={summary} heading={t.heading}>
        <Headline>{t.membersOnlyTitle}</Headline>
        <Note>{t.membersOnlyNote}</Note>
        {newcomerHike ? (
          <>
            <p className="mt-4 text-fg">
              {t.nearestNewcomer}{" "}
              <span className="font-semibold">{newcomerHike.title}</span>,{" "}
              {newcomerHike.dateLabel}.
            </p>
            <Link href={`/hikes/${newcomerHike.slug}`} className={`${PRIMARY} mt-3`}>
              {t.seeNewcomer}
              <LinkPending />
            </Link>
          </>
        ) : (
          <Note>{t.noNewcomer}</Note>
        )}
        <Link
          href="/profile/join"
          className={buttonClass({ variant: "ghost", size: "sm", className: "mt-3 -ml-4" })}
        >
          {t.joinWithCode}
        </Link>
      </Wrap>
    );
  }

  if (state.kind === "closed") {
    return (
      <Wrap summary={summary} heading={t.heading}>
        <Headline>{state.reason}</Headline>
      </Wrap>
    );
  }

  if (state.kind === "signIn") {
    return (
      <Wrap jump summary={summary} heading={t.heading}>
        <Link
          href={`/login?next=${encodeURIComponent(backHere)}`}
          className={PRIMARY}
        >
          {availability.full ? t.signInQueue : t.signIn}
          <LinkPending />
        </Link>
        <Note>{openToNewcomers ? t.signInNoteOpen : t.signInNoteMembers}</Note>
      </Wrap>
    );
  }

  if (state.kind === "registered") {
    const { confirmed } = state;
    return (
      <Wrap summary={summary} heading={t.heading}>
        {/* Без рода: «Ты записан» стояло у всех. И тем же словом, что в
            ленте и профиле, — одно состояние называлось тремя разными. */}
        <Headline tone={confirmed ? "success" : "warning"}>
          {confirmed
            ? t.confirmed
            : state.waitlistPos
              ? fill(t.waitlistPos, { n: state.waitlistPos })
              : t.waitlist}
        </Headline>
        <Note>{confirmed ? confirmedNote : waitlistNote}</Note>

        {result?.message && <Alert>{result.message}</Alert>}

        {confirmingCancel ? (
          <div className="mt-4 flex flex-col gap-2">
            {isLateCancel && (
              <p className={calloutClass({ tone: "warning", compact: true, className: "text-sm" })}>
                {t.lateCancel}
              </p>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => cancelMyRegistration(hikeId))}
              className={DANGER}
            >
              {pending ? t.cancelling : t.confirmCancel}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              {t.keep}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className={buttonClass({ variant: "danger", size: "sm", className: "mt-4" })}
          >
            {t.cancel}
          </button>
        )}
      </Wrap>
    );
  }

  if (state.kind === "profile") {
    return (
      <Wrap jump summary={summary} heading={t.heading}>
        <Link
          href={`/profile/edit?next=${encodeURIComponent(backHere)}`}
          className={PRIMARY}
        >
          {availability.full ? t.profileCtaQueue : t.profileCta}
          <LinkPending />
        </Link>
        <Note>{fill(t.profileNote, { fields: state.missing.join(", ") })}</Note>
      </Wrap>
    );
  }

  return (
    <Wrap jump summary={summary} heading={t.heading}>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => registerForHike(hikeId))}
        className={PRIMARY}
      >
        {pending ? t.registering : availability.full ? t.submitQueue : t.submit}
      </button>

      {result?.message && (
        <Alert>
          {result.message}
          {result.needsProfile && (
            <>
              {" "}
              <Link
                href={`/profile/edit?next=${encodeURIComponent(backHere)}`}
                className="underline underline-offset-4"
              >
                {t.fillProfile}
              </Link>
            </>
          )}
        </Alert>
      )}

      <Note>{availability.note}</Note>
    </Wrap>
  );
}

function Wrap({
  jump = false,
  summary,
  heading,
  children,
}: {
  /**
   * Цель плавающей «К записи» (register-jump-cta.tsx) — только там, где
   * человек может что-то сделать: войти, дозаполнить профиль, записаться.
   * До 14 сентября 2026 якорь стоял на общей обёртке всех восьми состояний,
   * и кнопка звала «к записи» уже записанного и того, у кого запись ещё не
   * открыта, — к блоку, где нажимать нечего.
   */
  jump?: boolean;
  summary: React.ReactNode;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-register-jump-anchor={jump ? "" : undefined}
      aria-labelledby="registration-heading"
      className={cardClass({ className: "mt-10" })}
    >
      <h2 id="registration-heading" className="text-xl font-bold">
        {heading}
      </h2>
      {summary && <div className="mt-4">{summary}</div>}
      <div className={summary ? "mt-5 border-t border-line pt-5" : "mt-4"}>
        {children}
      </div>
    </section>
  );
}

function Headline({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning";
  children: React.ReactNode;
}) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-fg";
  return <p className={`text-lg font-semibold ${color}`}>{children}</p>;
}

/**
 * Пояснение под кнопкой записи.
 *
 * Базовым кеглем, а не `text-sm`: это самый читаемый текст на сайте — он
 * отвечает на «что будет, если я нажму» ровно в тот момент, когда человек
 * решается. Мелким его читать не будут.
 */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-fg-muted">{children}</p>;
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={calloutClass({ tone: "danger", compact: true, className: "mt-3 text-sm" })}
    >
      {children}
    </p>
  );
}
