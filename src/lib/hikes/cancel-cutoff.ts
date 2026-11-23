/**
 * Рубеж отмены: после него отказ от места считается поздним.
 *
 * Правило живёт в базе — `cancellation_cutoff()` и `cancel_registration()`
 * в миграции 20260921120000_late_cancel_after_close.sql, — а здесь его копия
 * для интерфейса: время рубежа надо показать до записи, а предупреждение —
 * до нажатия «Отменить», а не после. Меняя правило, менять в обоих местах.
 *
 * До 21 сентября 2026 рубежом было «12 часов до выхода», и на живом походе
 * оно не поймало ничего: 17 из 25 отменились вечером накануне, примерно за
 * 13–14 часов. Решение автора — рубеж совпадает с закрытием записи.
 *
 * Модуль без импортов приложения — его гоняет `node --test`.
 */

/** Рубеж похода без закрытия записи: он должен быть всегда. */
export const CUTOFF_WITHOUT_CLOSE_MS = 24 * 60 * 60 * 1000;

/** Когда отмена становится поздней: закрытие записи, иначе сутки до выхода. */
export function cancellationCutoff(hike: {
  startsAt: string;
  registrationClosesAt: string | null;
}): string {
  if (hike.registrationClosesAt) return hike.registrationClosesAt;
  return new Date(
    new Date(hike.startsAt).getTime() - CUTOFF_WITHOUT_CLOSE_MS,
  ).toISOString();
}

/**
 * Засчитается ли своя отмена поздней, если нажать сейчас.
 *
 * Поздняя — только когда группа теряет человека, на которого уже
 * рассчитывала: место за ним, и оно было за ним ещё до рубежа. Стоящий в
 * очереди никому не мешает, а поднятый из неё после рубежа опоздать с
 * отказом не мог — предупреждать их о поздней отмене значит пугать зря.
 */
export function isLateCancel(
  cutoff: string,
  registration: { status: "confirmed" | "waitlist"; spotSince: string },
  now: Date,
): boolean {
  const at = new Date(cutoff).getTime();
  return (
    registration.status === "confirmed" &&
    now.getTime() > at &&
    new Date(registration.spotSince).getTime() <= at
  );
}
