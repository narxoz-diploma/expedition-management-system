"use client";

import { useState, useTransition } from "react";

import { setChatStatus } from "@/app/actions/hike-chat";
import { Chip } from "@/components/chip";
import { buttonClass } from "@/components/ui";
import { copyText } from "@/lib/copy";
import type { ChatStatus } from "@/lib/hikes/chat-roster";
import { formatAgo } from "@/lib/hikes/format";
import { formatPhone } from "@/lib/phone";
import { waInviteUrl } from "@/lib/wa-greeting";

/**
 * Одна строка списка на сборке чата.
 *
 * Телефон приходит сюда пропом, и это осознанное послабление правила №4:
 * страница закрыта requireStaffPage() и политиками, а номер на ней и так
 * печатается ссылкой tel: — то есть уже лежит в том же ответе сервера.
 * Граница правила — кому доступна страница, а не какого типа компонент.
 *
 * Три вида строки, а не два. «Ждём» и «в чате» — противоположные вещи:
 * первое значит, что человека в группе нет и к нему надо вернуться, второе —
 * что работа кончена. Пока они выглядели одинаково (обе просто гасли), экран
 * красил серым и сделанное, и висящее.
 */
export function ChatParticipantRow({
  hikeId,
  userId,
  name,
  phone,
  current,
  since,
  unaware,
  isLeader,
}: {
  hikeId: string;
  userId: string;
  name: string;
  phone: string | null;
  current: ChatStatus | null;
  /** Когда поставлена отметка — для строки «ссылку отправили N назад». */
  since: string | null;
  /** Поднялся из очереди и ещё не знает, что идёт. */
  unaware: boolean;
  isLeader: boolean;
}) {
  const [value, setValue] = useState<ChatStatus | null>(current);
  const [markedAt, setMarkedAt] = useState<string | null>(since);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mark(next: ChatStatus | null) {
    // Показываем сразу: лидер уходит в WhatsApp и возвращается на каждого
    // человека, и ждать ответа сервера между двадцатью пятью переключениями
    // приложения — это и есть та работа, ради экономии которой экран сделан.
    const previous = value;
    const previousAt = markedAt;
    setValue(next);
    setMarkedAt(next === null ? null : new Date().toISOString());
    setError(null);

    startTransition(async () => {
      const r = await setChatStatus(hikeId, userId, next);
      if (!r.ok) {
        setValue(previous);
        setMarkedAt(previousAt);
        setError(r.message ?? "Не сохранилось");
      }
    });
  }

  async function copyPhone() {
    if (!phone) return;
    setError(null);
    try {
      await copyText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Номер виден на самой кнопке — есть что выделить руками.
      setError("Браузер не дал скопировать. Выдели номер и скопируй вручную.");
    }
    mark("added");
  }

  // Короткая строка: делать с человеком больше нечего, и место на экране ему
  // ни к чему. На группе в двадцать пять это половина списка.
  //
  // Но короткая не значит блёклая. Первая версия печатала имя серым в ряд
  // таких же серых строк, и сделанное читалось как недоделанное и мелкое —
  // галочка тут не украшение, а единственное, что отличает «готово» от
  // «руки не дошли».
  if (value === "added") {
    return (
      <li className="flex min-h-tap items-center justify-between gap-3 rounded-xl bg-success/10 px-3">
        <span className="flex items-center gap-2 text-fg">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0 text-success"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
          {name}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => mark(null)}
          className="shrink-0 text-sm text-fg-muted underline underline-offset-4 hover:text-fg"
        >
          снять
        </button>
      </li>
    );
  }

  const waiting = value === "invited";

  return (
    <li
      className={
        waiting
          ? "rounded-2xl border border-warning-line bg-warning-tint p-4"
          : "rounded-2xl bg-surface p-4"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-fg">{name}</p>
        {isLeader && <span className="text-xs text-fg-muted">ведёт</span>}
        {unaware && (
          <Chip tone="warning">ещё не знает, что идёт</Chip>
        )}
      </div>

      {waiting && (
        <p className="mt-1 text-sm text-warning">
          Ссылка отправлена{markedAt && `, ${formatAgo(markedAt, new Date())}`} —
          в чате его ещё нет.
        </p>
      )}

      {phone === null ? (
        <p className="mt-2 text-sm text-fg-muted">
          Телефон не указан — добавить в чат нечем.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Отдельная кнопка «Зашёл» — то, чего не хватало вовсе.
              Отметить зашедшего по ссылке можно было только нажав на кнопку
              с номером, то есть догадавшись, что она делает не то, что на
              ней написано. */}
          {waiting && (
            <button
              type="button"
              disabled={pending}
              onClick={() => mark("added")}
              /* Не primary, хотя по смыслу главное: акцентных кнопок на
                 экране было бы столько же, сколько ждущих строк, а по UI.md
                 primary ровно одна на экран. Выделяется рамкой и порядком. */
              className={buttonClass({ size: "sm", className: "border-accent-500" })}
            >
              Зашёл
            </button>
          )}
          {/* Номер на самой кнопке: копировать его — основной путь, и
              прятать его за словом «скопировать» значит заставить лидера
              нажимать вслепую. */}
          <button
            type="button"
            disabled={pending}
            onClick={copyPhone}
            className={buttonClass({ size: "sm" })}
          >
            {copied ? "Скопировано" : formatPhone(phone)}
          </button>
          {/* Ссылка, а не кнопка: открывает личный чат в WhatsApp, не
              сохраняя номер в контактах телефона. Нужна тем, у кого стоит
              запрет на добавление в группы, — а кто это, заранее неизвестно,
              поэтому кнопка доступна сразу, а не после неудачи.
              Текст с именем предзаполнен — см. lib/wa-greeting.ts: подряд
              разосланные одинаковые сообщения новым номерам WhatsApp
              распознаёт как рассылку так же, как массовое добавление. */}
          <a
            href={waInviteUrl(phone, name)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => mark("invited")}
            className={buttonClass({ size: "sm" })}
          >
            {waiting ? "Написать ещё раз" : "Написать"}
          </a>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
