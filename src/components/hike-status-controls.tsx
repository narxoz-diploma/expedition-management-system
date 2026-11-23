"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteDraftHike, publishHike, unpublishHike } from "@/app/actions/hikes";
import { buttonClass } from "@/components/ui";

/**
 * Смена статуса похода — на экране группы, а не в строке списка.
 *
 * До 14 сентября 2026 «Опубликовать» и «Снять с публикации» стояли в строке
 * списка походов, тем же весом и рядом с «Посмотреть», без подтверждения:
 * промах прятал поход с записавшимися людьми. Публикация — главное дело
 * черновика, поэтому здесь она главная кнопка; снятие и удаление — опасные,
 * поэтому с подтверждением.
 */

export function PublishHikeButton({ hikeId }: { hikeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await publishHike(hikeId);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={publish}
        className={buttonClass({ variant: "primary", block: true })}
      >
        {pending ? "Публикуем…" : "Опубликовать"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

export function UnpublishHikeControl({ hikeId }: { hikeId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function unpublish() {
    setError(null);
    startTransition(async () => {
      const result = await unpublishHike(hikeId);
      if (result.message) setError(result.message);
      else {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        Снять с публикации
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">
        Поход вернётся в черновики и пропадёт из ближайших. Записи останутся,
        но новые записаться не смогут, пока не опубликуешь снова.
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
          onClick={unpublish}
          className={buttonClass({ variant: "danger", size: "sm" })}
        >
          {pending ? "Снимаем…" : "Да, снять"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Не снимать
        </button>
      </div>
    </div>
  );
}

export function DeleteDraftControl({ hikeId }: { hikeId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      // При успехе действие само уводит в список походов: этого экрана
      // больше нет, возвращать сюда нечего.
      const result = await deleteDraftHike(hikeId);
      if (result?.message) setError(result.message);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClass({ variant: "danger", size: "sm" })}
      >
        Удалить черновик
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">
        Черновик исчезнет совсем, вместе с составом лидеров. Вернуть его будет
        нельзя.
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
          {pending ? "Удаляем…" : "Да, удалить"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Не удалять
        </button>
      </div>
    </div>
  );
}
