/**
 * Раскладка записей похода по блокам экрана состава.
 *
 * Отдельным модулем без импортов приложения, чтобы это гонял `node --test`:
 * здесь живёт правило, которое один раз уже молча ломалось — снятый
 * со-лидер остаётся строкой с `asLeader = true` и статусом `cancelled`, и
 * фильтр по одному флагу возвращал его в блок «Ведут».
 */

/** Минимум, по которому раскладывается состав. Полная запись — в `roster.ts`. */
export type RosterMember = {
  userId: string;
  status: "confirmed" | "waitlist" | "cancelled";
  asLeader: boolean;
  waitlistPos: number | null;
  cancelledAt: string | null;
};

export type RosterBuckets<T> = {
  leaders: T[];
  confirmed: T[];
  waitlist: T[];
  cancelled: T[];
};

export function bucketRoster<T extends RosterMember>(
  entries: readonly T[],
): RosterBuckets<T> {
  const active = new Set(
    entries.filter((e) => e.status !== "cancelled").map((e) => e.userId),
  );

  return {
    // Статус здесь обязателен: см. комментарий к модулю.
    leaders: entries.filter((e) => e.asLeader && e.status !== "cancelled"),
    confirmed: entries.filter((e) => e.status === "confirmed" && !e.asLeader),
    waitlist: entries
      .filter((e) => e.status === "waitlist")
      .sort((a, b) => (a.waitlistPos ?? 0) - (b.waitlistPos ?? 0)),
    cancelled: entries
      .filter(
        (e) =>
          e.status === "cancelled" &&
          // Снятый со-лидер — не «выпал из группы», а изменение состава
          // ведущих: его место в блоке «Кто ведёт», а не среди отменившихся.
          !e.asLeader &&
          // Передумал и записался снова — запись остаётся двумя строками,
          // уникальность в базе частичная. Он идёт, и здесь ему не место.
          !active.has(e.userId),
      )
      // Свежие сверху: перед выходом важна последняя отмена, а не первая.
      .sort((a, b) => (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? ""))
      // Отменённых строк на человека бывает сколько угодно: уникальность
      // частичная. Записался, отменил, записался, отменил — и экран группы
      // показывал его дважды (живой случай, «Горельник», 13 сентября 2026).
      // Список уже отсортирован, остаётся последняя отмена.
      .filter(
        (e, i, list) => list.findIndex((x) => x.userId === e.userId) === i,
      ),
  };
}
