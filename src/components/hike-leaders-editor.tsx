"use client";

import { useState, useTransition } from "react";

import {
  addHikeLeader,
  removeHikeLeader,
  transferHikeResponsibility,
} from "@/app/actions/hike-leaders";
import { buttonClass, calloutClass, cardClass } from "@/components/ui";
import type { HikeLeader } from "@/lib/hikes/leaders";

/**
 * Состав лидеров похода.
 *
 * Не косметика: по этому списку раздаётся доступ к экстренным контактам
 * участников. Кто здесь есть — тот на маршруте сможет позвонить родным,
 * кого нет — не сможет.
 */
export function HikeLeadersEditor({
  hikeId,
  leaders,
  candidates,
  canEdit,
  currentUserId,
}: {
  hikeId: string;
  leaders: HikeLeader[];
  candidates: { id: string; fullName: string }[];
  canEdit: boolean;
  /** Снять с похода себя может любой из состава, а не только ответственный. */
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Чья строка сейчас в работе. `pending` от useTransition один на компонент и
  // сказать, какое именно имя нажали, не может — а список длиной в пару экранов
  // без этого отвечает не там, куда смотрит палец.
  const [busy, setBusy] = useState<string | null>(null);
  // Кого сейчас переспрашиваем перед передачей. Передача — единственное
  // здесь действие, которое нельзя отменить самому: вернуть ответственность
  // сможет только новый ответственный или админ.
  const [confirming, setConfirming] = useState<string | null>(null);

  const inList = new Set(leaders.map((l) => l.id));
  const available = candidates.filter((c) => !inList.has(c.id));

  function add(userId: string) {
    setError(null);
    setBusy(userId);
    startTransition(async () => {
      const r = await addHikeLeader(hikeId, userId);
      if (!r.ok) setError(r.message ?? "Не получилось");
      setBusy(null);
    });
  }

  function remove(userId: string) {
    setError(null);
    setBusy(userId);
    startTransition(async () => {
      const r = await removeHikeLeader(hikeId, userId);
      if (!r.ok) setError(r.message ?? "Не получилось");
      setBusy(null);
    });
  }

  function transfer(userId: string) {
    setError(null);
    setBusy(userId);
    startTransition(async () => {
      const r = await transferHikeResponsibility(hikeId, userId);
      if (!r.ok) setError(r.message ?? "Не получилось");
      setBusy(null);
      setConfirming(null);
    });
  }

  return (
    <section className={cardClass()}>
      <h2 className="font-bold">Кто идёт из лидеров</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Все из этого списка увидят телефоны участников и контакты на случай ЧП.
        Добавляй только тех, кто действительно идёт.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {leaders.map((leader) => (
          <li key={leader.id} className="border-b border-line pb-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="text-fg">
                {leader.fullName}
                {/*
                  «отвечает за поход», а не «создал»: после передачи создатель
                  и ответственный — разные люди, и подпись стала бы враньём.
                */}
                {leader.responsible && (
                  <span className="ml-2 text-sm text-fg-muted">
                    отвечает за поход
                  </span>
                )}
              </span>

              {!leader.responsible && (canEdit || leader.id === currentUserId) && (
                <span className="flex items-center gap-1">
                  {canEdit && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setConfirming(
                          confirming === leader.id ? null : leader.id,
                        )
                      }
                      className={buttonClass({ variant: "ghost", size: "sm" })}
                    >
                      Передать
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(leader.id)}
                    className={buttonClass({ variant: "ghost", size: "sm", className: "hover:text-danger" })}
                  >
                    {busy === leader.id
                      ? "Убираем…"
                      : leader.id === currentUserId
                        ? "Не пойду"
                        : "Убрать"}
                  </button>
                </span>
              )}
            </div>

            {confirming === leader.id && (
              <div
                className={calloutClass({
                  tone: "warning",
                  compact: true,
                  className: "mt-3",
                })}
              >
                <p className="font-medium text-fg">
                  Передать ответственность? {leader.fullName} сможет править
                  поход, менять состав и видеть экстренные контакты группы.
                </p>
                <p className="mt-2 text-sm text-fg-muted">
                  Ты останешься лидером и пойдёшь как шёл, но вернуть
                  ответственность сможет только он сам или админ.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => transfer(leader.id)}
                    className={buttonClass({ variant: "primary", size: "sm" })}
                  >
                    {busy === leader.id ? "Передаём…" : "Да, передать"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirming(null)}
                    className={buttonClass({ variant: "ghost", size: "sm" })}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/*
        Список с кнопкой у каждого имени, а не `select`.

        Раскрытый `select` на Android рисует система: чёрный список системным
        шрифтом с синей подсветкой, мимо всей темы, и `appearance-none` тут не
        помогает — он причёсывает только закрытое поле. Свой комбобокс писать
        дороже, чем задача стоит. Лидеров в клубе единицы, поэтому список
        просто разворачивается — заодно он той же анатомии, что состав выше,
        и добавление стоит одно нажатие вместо четырёх.
      */}
      {canEdit &&
        (available.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
              Кого можно добавить
            </h3>
            <p className="mt-1 text-sm text-fg-muted">
              Чтобы передать ответственность, сначала добавь человека в состав:
              отвечать за поход, не видя контактов своей группы, нельзя.
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {available.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-4 border-b border-line pb-2"
                >
                  <span className="text-fg">{candidate.fullName}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => add(candidate.id)}
                    className={buttonClass({ variant: "ghost", size: "sm" })}
                  >
                    {busy === candidate.id ? "Добавляем…" : "Добавить"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">
            Других лидеров в клубе пока нет. Роль выдаёт админ.
          </p>
        ))}
    </section>
  );
}
