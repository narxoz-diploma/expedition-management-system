"use client";

import { useState, useTransition } from "react";

import {
  clearAttendance,
  excuseStrike,
  markAllCompleted,
  markAttendance,
  removeParticipant,
  takeFromWaitlist,
} from "@/app/actions/attendance";
import { buttonClass } from "@/components/ui";
import {
  isSettled,
  type AttendancePhase,
  type AttendanceResult,
} from "@/lib/hikes/attendance-progress";

/**
 * Кнопки по фазам.
 *
 * На сборе лидер знает ровно одно: человек тут или нет. Третьей кнопки там
 * не было бы смысла — «сошёл» выясняется через четыре часа, — а «Прошёл» на
 * точке сбора прямо вредна: она выдаёт членство в клубе тому, кто ещё стоит
 * на парковке.
 */
const BY_PHASE: Record<
  AttendancePhase,
  { value: AttendanceResult; label: string }[]
> = {
  // Без рода: «Пришёл», «Не пришёл» стояли у всех подряд, а в группе много
  // девушек (проход по экранам, 13 сентября 2026). Короткие слова — кнопки
  // стоят по две-три в ряд на телефоне.
  gathering: [
    { value: "arrived", label: "Здесь" },
    { value: "no_show", label: "Нет" },
  ],
  outcome: [
    { value: "completed", label: "Пройден" },
    { value: "turned_back", label: "Сход" },
    { value: "no_show", label: "Неявка" },
  ],
};

/** Подпись готовой строки: она заменяет собой кнопки, и без неё не читается. */
const DONE_LABEL: Record<AttendanceResult, string> = {
  arrived: "на месте",
  completed: "маршрут пройден",
  turned_back: "сход с маршрута",
  no_show: "неявка",
};

function CheckIcon() {
  return (
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
  );
}

/**
 * Одна строка на экране явки.
 *
 * Клиентский компонент получает только имя и идентификаторы: телефон,
 * снаряжение и контакты на случай ЧП сюда не приезжают вовсе — на точке
 * сбора они не нужны, ради чего экран и вынесен из ростера.
 *
 * Цвет здесь значит одно и то же, что на сборке чата: зелёное — сделанное,
 * жёлтое — то, к чему надо вернуться. Поэтому «сошёл» жёлтым не красится,
 * хотя человек и не дошёл: с ним всё решено, а вот отмеченный «пришёл»
 * после выхода — это несделанная работа, и выглядеть она должна именно так.
 *
 * И главное: сделанное сжимается в строку, несделанное остаётся карточкой.
 * Невнимание видно по высоте списка, а не по оттенку серого — на 390px это
 * читается боковым зрением, не вчитываясь.
 */
export function AttendanceRow({
  hikeId,
  userId,
  name,
  current,
  phase,
  canMark,
}: {
  hikeId: string;
  userId: string;
  name: string;
  current: AttendanceResult | null;
  phase: AttendancePhase;
  /**
   * Открылось ли окно отметок. Решает всё равно база — она отвечает
   * HIKE_NOT_STARTED, — но кнопка, которая гарантированно вернёт ошибку,
   * должна быть неактивной, а не выглядеть рабочей.
   */
  canMark: boolean;
}) {
  const [value, setValue] = useState<AttendanceResult | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Нажатие на выбранную кнопку снимает отметку: промах исправляется ею же. */
  function mark(result: AttendanceResult | null) {
    const clearing = result === null || value === result;

    // Показываем сразу, не дожидаясь сервера: на точке сбора связь слабая,
    // а лидер отмечает людей подряд и ждать не может.
    const previous = value;
    setValue(clearing ? null : result);
    setError(null);

    startTransition(async () => {
      const r =
        clearing || result === null
          ? await clearAttendance(hikeId, userId)
          : await markAttendance(hikeId, userId, result);
      if (!r.ok) {
        setValue(previous);
        setError(r.message ?? "Не сохранилось");
      }
    });
  }

  // Готовая строка. Короткая, потому что делать с человеком больше нечего —
  // на группе в двадцать пять это половина экрана. Но короткая не значит
  // блёклая: серым в ряду серых сделанное читается как недоделанное.
  if (value !== null && isSettled(value, phase)) {
    const good = value === "arrived" || value === "completed";
    const bad = value === "no_show";

    return (
      <li
        className={`flex min-h-tap items-center justify-between gap-3 rounded-md px-3 ${
          good ? "bg-success/10" : bad ? "bg-danger/10" : "bg-surface-muted"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 text-fg">
          {good && <CheckIcon />}
          <span className="truncate">{name}</span>
          {!good && (
            <span className="shrink-0 text-sm text-fg-muted">
              {DONE_LABEL[value]}
            </span>
          )}
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

  // Пришёл на сбор, а итога нет. Единственное состояние, к которому лидер
  // обязан вернуться, — и единственное жёлтое на экране.
  const awaiting = value === "arrived";

  return (
    <li
      className={
        awaiting
          ? "rounded-2xl border border-warning-line bg-warning-tint p-4"
          : "rounded-2xl bg-surface p-4"
      }
    >
      <p className="font-medium text-fg">{name}</p>
      {awaiting && (
        <p className="mt-1 text-sm text-warning">
          Пришёл на сбор — итог не проставлен.
        </p>
      )}

      <div
        role="group"
        aria-label={`Явка: ${name}`}
        className={`mt-3 grid gap-2 ${
          BY_PHASE[phase].length === 2 ? "grid-cols-2" : "grid-cols-3"
        }`}
      >
        {BY_PHASE[phase].map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={pending || !canMark}
              onClick={() => mark(option.value)}
              className={`h-tap rounded-xl text-sm font-medium disabled:opacity-40 ${
                active
                  ? "bg-fg font-semibold text-bg"
                  : "bg-surface-raised text-fg-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * «Все дошли» — итог всей группе одним нажатием.
 *
 * В девяти походах из десяти доходят все, а второй заход лидер делает дома и
 * уставшим. Двадцать нажатий он отложит на завтра, а завтра не вернётся —
 * и гости, сходившие в свой первый поход, останутся гостями.
 *
 * Подтверждение со списком имён обязательно: кнопка меняет членство в клубе
 * сразу нескольким людям, и увидеть, кого именно она берёт, лидер должен до
 * нажатия, а не после.
 */
export function MarkAllCompletedButton({
  hikeId,
  names,
}: {
  hikeId: string;
  /** Кто отмечен «пришёл» — только их кнопка и переводит. */
  names: string[];
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await markAllCompleted(hikeId);
      if (!r.ok) setError(r.message ?? "Не сохранилось");
      else setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClass({ variant: "primary" })}
      >
        Все дошли
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-medium text-fg">
        Отметить «пройден» — {names.length}:
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-fg-muted">
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-fg-muted">
        Неявки и неотмеченные останутся как есть.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={run}
          className={buttonClass({ variant: "primary", size: "sm" })}
        >
          {pending ? "Отмечаем…" : "Да, все дошли"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

/** Снятие участника: подтверждение обязательно. */
export function RemoveParticipantButton({
  hikeId,
  userId,
  name,
  queueFrozen,
}: {
  hikeId: string;
  userId: string;
  name: string;
  /**
   * После закрытия записи место никому не уходит само — и подтверждение
   * не должно обещать обратного. Обязательный: забытый аргумент вернул бы
   * обещание, которое база уже не выполняет.
   */
  queueFrozen: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await removeParticipant(hikeId, userId);
      if (!r.ok) setError(r.message ?? "Не получилось");
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClass({ variant: "danger", size: "sm" })}
      >
        Снять с похода
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">
        Снять {name}?{" "}
        {queueFrozen
          ? "Место освободится — возьми кого-нибудь из очереди."
          : "Место сразу уйдёт первому из очереди."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className={buttonClass({ variant: "danger", size: "sm" })}
        >
          {pending ? "Снимаем…" : "Да, снять"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

/**
 * «Взять» из очереди на свободное место.
 *
 * Без подтверждения: нажимают после разговора в WhatsApp, человек уже
 * сказал «иду». Промах исправляется «Снять с похода» — и место снова свободно,
 * очередь после закрытия записи его не заберёт.
 */
export function TakeFromWaitlistButton({
  hikeId,
  userId,
}: {
  hikeId: string;
  userId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function take() {
    setError(null);
    startTransition(async () => {
      const r = await takeFromWaitlist(hikeId, userId);
      if (!r.ok) setError(r.message ?? "Не получилось");
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={take}
        className={buttonClass({ variant: "primary", size: "sm" })}
      >
        {pending ? "Берём…" : "Взять в группу"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

/** «Уважительная причина» у отметки: снимает её и возвращает обратно. */
export function ExcuseStrikeButton({
  hikeId,
  userId,
  kind,
  excused: initial,
}: {
  hikeId: string;
  userId: string;
  kind: "late_cancel" | "no_show";
  excused: boolean;
}) {
  const [excused, setExcused] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !excused;
    setExcused(next);
    setError(null);
    startTransition(async () => {
      const r = await excuseStrike(hikeId, userId, kind, next);
      if (!r.ok) {
        setExcused(!next);
        setError(r.message ?? "Не сохранилось");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        aria-pressed={excused}
        className={buttonClass({ variant: "ghost", size: "sm" })}
      >
        {excused ? "Отметка снята — вернуть" : "Уважительная причина"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
