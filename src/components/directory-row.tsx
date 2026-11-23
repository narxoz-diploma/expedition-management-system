"use client";

import { useState, useTransition } from "react";

import { setClubChatStatus } from "@/app/actions/club-chat";
import { Chip } from "@/components/chip";
import { buttonClass, cardClass } from "@/components/ui";
import { copyText } from "@/lib/copy";
import { fitnessShort } from "@/lib/fitness";
import type { ChatStatus } from "@/lib/hikes/chat-roster";
import type { DirectoryPerson } from "@/lib/directory";
import { formatDate } from "@/lib/hikes/format";
import { formatPhone } from "@/lib/phone";
import { CLUB_CHAT_INVITE_URL, waInviteUrl } from "@/lib/wa-greeting";

const STATUS_LABELS: Record<DirectoryPerson["membershipStatus"], string> = {
  member: "участник",
  guest: "гость",
  pending: "заявка",
  alumni: "выпускник",
};

/**
 * Человек в справочнике клуба.
 *
 * Кнопки те же, что на сборке чата похода, и по той же причине: механика
 * WhatsApp не меняется от того, какой это чат — добавлять по одному, а кого
 * не дали добавить, тому ссылку в личку. Отметка здесь одна на человека
 * навсегда: в общий чат клуба вступают один раз.
 */
export function DirectoryRow({ person }: { person: DirectoryPerson }) {
  const [value, setValue] = useState<ChatStatus | null>(person.chatStatus);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mark(next: ChatStatus | null) {
    const previous = value;
    setValue(next);
    setError(null);

    startTransition(async () => {
      const r = await setClubChatStatus(person.id, next);
      if (!r.ok) {
        setValue(previous);
        setError(r.message ?? "Не сохранилось");
      }
    });
  }

  async function copyPhone() {
    if (!person.phone) return;
    setError(null);
    try {
      await copyText(person.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Браузер не дал скопировать. Выдели номер и скопируй вручную.");
    }
    mark("added");
  }

  return (
    /* Плотнее, чем была: карточка в пять строк с двумя рядами кнопок
       занимала полэкрана, и 279 человек — сотня экранов прокрутки. Имя,
       статус и походы — одной строкой, кнопки и «Подробнее» — второй. */
    <li className={cardClass({ dense: true })}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="font-medium text-fg">{person.fullName}</p>
        <Chip>{STATUS_LABELS[person.membershipStatus]}</Chip>
        {value === "added" && <Chip tone="success">в чате</Chip>}
        {value === "invited" && <Chip tone="warning">ждём</Chip>}
        {/* Самая полезная строка при наборе группы: «не ходил с марта»
            говорит больше, чем счётчик походов. */}
        <span className="text-sm text-fg-muted">
          {person.hikesCompleted > 0
            ? `походов: ${person.hikesCompleted}${
                person.hikesLed > 0 ? `, из них вёл ${person.hikesLed}` : ""
              }`
            : "ни одного похода"}
          {person.lastHikeAt ? ` · последний ${formatDate(person.lastHikeAt)}` : ""}
        </span>
      </div>

      {person.phone && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={copyPhone}
            className={buttonClass({ size: "sm" })}
          >
            {copied ? "Скопировано" : formatPhone(person.phone)}
          </button>
          {/* Текст с именем и ссылкой предзаполнен — см. lib/wa-greeting.ts:
              после набора это десятки новых номеров подряд, а одинаковый
              текст всем WhatsApp распознаёт как рассылку так же, как
              массовое добавление в группу. Ссылка одна на общий чат клуба,
              не меняется на каждого человека — в отличие от чата похода. */}
          <a
            href={waInviteUrl(person.phone, person.fullName, CLUB_CHAT_INVITE_URL)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => mark("invited")}
            className={buttonClass({ size: "sm" })}
          >
            Написать
          </a>
          {value !== null && (
            <button
              type="button"
              disabled={pending}
              onClick={() => mark(null)}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              снять отметку
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <details className="mt-1">
        <summary className="inline-flex h-tap cursor-pointer items-center text-sm text-fg-muted underline underline-offset-4">
          Подробнее
        </summary>
        <div className="flex flex-col gap-2 pb-2 text-sm text-fg-muted">
          <p className="flex flex-wrap gap-x-3">
            {person.studyYear && <span>{person.studyYear} курс</span>}
            {person.noShowCount > 0 && <span>неявок: {person.noShowCount}</span>}
            {person.strikes.total > 0 && (
              <span className={person.strikes.restricted ? "font-medium text-warning" : undefined}>
                {person.strikes.restricted ? "только очередь" : "отметок"}: {person.strikes.total}
              </span>
            )}
          </p>
          <p>Форма: {fitnessShort(person.fitnessLevel) ?? "не указана"}</p>
          <p>Где был: {person.visitedPlaces || "не заполнено"}</p>
        </div>
      </details>
    </li>
  );
}
