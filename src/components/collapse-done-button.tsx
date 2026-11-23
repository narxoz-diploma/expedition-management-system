"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Перечитать список и убрать отмеченных под свёртку.
 *
 * Кнопкой, а не само собой после каждой отметки. Живая пересортировка
 * подтягивает следующую строку под палец — а лидер жмёт двадцать пять раз
 * подряд, и промах достаётся не той кнопке и не тому человеку. Поэтому
 * строки стоят на месте, а переезд происходит по явному решению.
 */
export function CollapseDoneButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg disabled:opacity-60"
    >
      {pending ? "Обновляем…" : "Свернуть отмеченных"}
    </button>
  );
}
