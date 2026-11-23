"use client";

import { useState, useTransition } from "react";

import { deleteAccountByAdmin } from "@/app/actions/account";
import { buttonClass } from "@/components/ui";

/** Удаление по сроку хранения. Два шага: откатить нечего. */
export function DeleteProfileButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await deleteAccountByAdmin(userId);
      if (!r.ok) setError(r.message ?? "Не получилось");
    });
  }

  if (!confirming) {
    return (
      /* danger: то же необратимое действие, только чужими руками. */
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClass({ variant: "danger", size: "sm" })}
      >
        Удалить данные
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">
        Стереть все данные — {name}? Вернуть будет нечем.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className={buttonClass({ variant: "danger", size: "sm" })}
        >
          {pending ? "Удаляем…" : "Да, стереть"}
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
