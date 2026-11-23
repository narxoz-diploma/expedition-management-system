"use client";

import { useState, useTransition } from "react";

import {
  createInviteCode,
  importMemberPhones,
  setMembershipStatus,
  type PhoneImportResult,
} from "@/app/actions/membership";
import { buttonClass, calloutClass, cardClass, fieldClass } from "@/components/ui";
import { pluralWithNumber } from "@/lib/hikes/format";
import type { MemberApplicant } from "@/lib/members";
import { formatPhone } from "@/lib/phone";

export function ApplicantRow({ applicant }: { applicant: MemberApplicant }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(status: "member" | "guest") {
    setError(null);
    startTransition(async () => {
      const result = await setMembershipStatus(applicant.id, status);
      if (result.ok) {
        setDone(status === "member" ? "Подтверждён" : "Отклонена");
      } else {
        setError(result.message ?? "Не получилось");
      }
    });
  }

  // Главная кнопка — только у заявки: её ждут. У гостя подтверждение —
  // исключение, и 243 оранжевые кнопки подряд звали делать то, что обычно не
  // нужно.
  const isApplication = applicant.membershipStatus === "pending";

  return (
    <li className={cardClass({ dense: true })}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium text-fg">{applicant.fullName}</span>
        {applicant.phone && (
          <span className="text-sm text-fg-muted">
            {formatPhone(applicant.phone)}
          </span>
        )}
      </div>

      {applicant.studyYear && (
        <p className="mt-1 text-sm text-fg-muted">{applicant.studyYear} курс</p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {done ? (
        <p className="mt-3 text-sm text-success">{done}</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => decide("member")}
            className={buttonClass({
              variant: isApplication ? "primary" : "secondary",
              size: "sm",
            })}
          >
            Подтвердить
          </button>
          {/* Только у заявок. В списке гостей человек уже гость, и кнопка
              писала guest → guest: база отрабатывала, на экране не менялось
              ничего, и выглядело это как сломанная кнопка. */}
          {isApplication && (
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("guest")}
              className={buttonClass({ size: "sm" })}
            >
              Отклонить
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function PhoneImportForm() {
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<PhoneImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await importMemberPhones(raw, note);
      setResult(r);
      if (r.ok) setRaw("");
    });
  }

  return (
    <form onSubmit={submit}>
      <p className="text-sm text-fg-muted">
        Вставь номера из группы — как есть, хоть с именами и переносами.
        Разберём сами. Номера сохраняются: тот, кто зарегистрируется завтра,
        подтвердится автоматически, вставлять список заново не нужно.
      </p>

      {/* Иностранный номер в примере не для красоты: он единственный, что
          требует от лидера действия — код страны, иначе строка не
          разберётся. Показать это лучше до вставки, чем строкой «не
          разобрали» после. */}
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        placeholder={
          "+7 701 234 56 78\n8 747 111 22 33, Айгуль\n77751112233\n+62 812 3456 7890"
        }
        className={`mt-4 font-mono text-sm ${fieldClass()}`}
      />

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Откуда список — например, «группа, осень 2026»"
        className={`mt-3 ${fieldClass()}`}
      />

      <button
        type="submit"
        disabled={pending || raw.trim().length === 0}
        className={buttonClass({ variant: "primary", size: "sm", block: true, className: "mt-3" })}
      >
        {pending ? "Разбираем…" : "Добавить номера"}
      </button>

      {result && (
        <div
          role="status"
          className={calloutClass({
            tone: result.ok ? "success" : "danger",
            compact: true,
            className: "mt-4 text-sm",
          })}
        >
          {result.ok ? (
            <>
              <p className="text-fg">
                Добавлено{" "}
                {pluralWithNumber(result.added ?? 0, "номер", "номера", "номеров")}
                , подтверждено сразу{" "}
                {pluralWithNumber(
                  result.matchedNow ?? 0,
                  "человек",
                  "человека",
                  "человек",
                )}
                .
              </p>
              {(result.matchedNow ?? 0) === 0 && (result.added ?? 0) > 0 && (
                <p className="mt-2 text-fg-muted">
                  Никто не подтвердился прямо сейчас — значит эти люди ещё не
                  завели профиль. Подтвердятся сами, когда зарегистрируются.
                </p>
              )}
            </>
          ) : (
            <p className="text-fg">{result.message}</p>
          )}

          {result.rejected && result.rejected.length > 0 && (
            <div className="mt-3">
              <p className="text-fg-muted">
                Не разобрали{" "}
                {pluralWithNumber(
                  result.rejected.length,
                  "строку",
                  "строки",
                  "строк",
                )}
                :
              </p>
              <ul className="mt-1 list-disc pl-5 font-mono text-xs text-fg-muted">
                {result.rejected.slice(0, 10).map((line, i) => (
                  <li key={`${line}-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

export function InviteCodeForm() {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await createInviteCode(code, label, expiresAt);
      if (r.ok) {
        setCode("");
        setLabel("");
        setExpiresAt("");
      } else {
        setError(r.message ?? "Не получилось");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Код публикуется в группе и действует до указанной даты. Защита здесь
        слабая намеренно: задача не в безопасности, а в подтверждении «я
        действительно в группе».
      </p>

      {/* Подписи над полями, а не одни плейсхолдеры: введя значение, уже не
          видно, где код, а где подпись. */}
      <label className="text-sm text-fg-muted">
        Код
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="OSEN2026"
          autoCapitalize="characters"
          className={`mt-1 ${fieldClass()}`}
        />
      </label>
      <label className="text-sm text-fg-muted">
        Подпись — для себя, участники её не видят
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Осень 2026"
          className={`mt-1 ${fieldClass()}`}
        />
      </label>
      <label className="text-sm text-fg-muted">
        Действует до
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className={`mt-1 ${fieldClass()}`}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || code.trim().length < 4}
        className={buttonClass({ size: "sm", block: true })}
      >
        {pending ? "Создаём…" : "Создать код"}
      </button>
    </form>
  );
}
