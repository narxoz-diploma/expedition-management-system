"use client";

import { useState, useTransition } from "react";

import { cancelHike } from "@/app/actions/hikes";
import { buttonClass, calloutClass, fieldClass } from "@/components/ui";

/**
 * Отмена похода.
 *
 * Внизу экрана и в два шага намеренно: отменить поход — единственное здесь
 * действие, которое видит вся группа и которое нельзя откатить кнопкой,
 * статус `cancelled` в интерфейс обратно не возвращается.
 *
 * Причина не обязательна, но спрашивается до отмены, а не после: она уходит
 * в объявление для группы, и дописать её вдогонку было бы уже некуда.
 */
export function CancelHikeControl({ hikeId }: { hikeId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await cancelHike(hikeId, reason);
      if (result?.message) setError(result.message);
      // Успех не закрывает форму: страница перерисуется целиком, и на месте
      // этого блока окажется готовое объявление для группы.
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass({ variant: "danger", size: "sm" })}
      >
        Отменить поход
      </button>
    );
  }

  return (
    <div className={calloutClass({ tone: "danger", compact: true })}>
      <p className="font-medium text-fg">Отменить поход?</p>
      <p className="mt-2 text-sm text-fg-muted">
        Запись закроется, а на карточке появится «Отменён». Записи участников
        останутся — по ним ты и поймёшь, кого предупредить. Вернуть поход
        кнопкой уже нельзя.
      </p>

      <label htmlFor="cancel-reason" className="mt-4 block text-sm text-fg-muted">
        Причина — уйдёт в объявление для группы
      </label>
      <textarea
        id="cancel-reason"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Штормовое предупреждение на выходные"
        className={`mt-2 ${fieldClass()}`}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={run}
          className={buttonClass({ variant: "danger", size: "sm" })}
        >
          {pending ? "Отменяем…" : "Да, отменить поход"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Не отменять
        </button>
      </div>
    </div>
  );
}
