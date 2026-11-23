"use client";

import { useLinkStatus } from "next/link";

/**
 * Кружок ожидания внутри ссылки, пока она ведёт на новую страницу.
 *
 * Полоска в шапке отвечает «идёт», а это — «идёт именно то, что ты нажал».
 * Ставится только на главные действия: на остальных ссылках хватает полоски,
 * а спиннеры по всему сайту — это разнобой в движении.
 *
 * `useLinkStatus` работает только внутри `Link`, поэтому это отдельный
 * компонент, а не свойство кнопки.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
