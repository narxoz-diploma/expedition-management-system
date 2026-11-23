/**
 * Отметки явки: состояния и сводка по группе.
 *
 * Модуль без импортов приложения — его гоняет `node --test`.
 *
 * Состояний четыре, и они делятся не поровну. «Пришёл» — промежуточное:
 * лидер сказал про человека всё, что знает на точке сбора, но итога ещё нет.
 * Остальные три окончательные. Экран красит их по этой границе, а не по
 * тому, «хорошее» состояние или «плохое».
 */

export type AttendanceResult =
  /** Вышел с группой. Ни счётчиков, ни членства, ни закрытия похода. */
  | "arrived"
  | "completed"
  | "turned_back"
  | "no_show";

/**
 * Фаза экрана явки.
 *
 * `gathering` — сбор: лидер знает ровно одно, пришёл человек или нет.
 * `outcome` — после: известен итог.
 *
 * Фаза не связана с открытием окна отметок (оно на два часа раньше выхода,
 * см. `attendance-window.ts`): окно отвечает на вопрос «можно ли уже
 * отмечать», фаза — «что именно спрашивать».
 */
export type AttendancePhase = "gathering" | "outcome";

/**
 * Сколько сбор длится после объявленного времени выхода.
 *
 * До 21 сентября 2026 фаза менялась ровно во время выхода, и опоздавшего на
 * десять минут было уже не отметить «Здесь» — только сразу «Пройден». Лидеры
 * обходили это, сдвигая время начала похода, а от него зависят и «поход
 * прошёл» на сайте, и поздние отмены. Два часа — решение автора: покрывает
 * опоздавших, задержку автобуса и выход позже объявленного, а итог всё равно
 * ставят вечером, после возвращения.
 */
export const GATHERING_GRACE_MS = 2 * 60 * 60 * 1000;

export function attendancePhase(startsAt: string, now: Date): AttendancePhase {
  return now.getTime() < new Date(startsAt).getTime() + GATHERING_GRACE_MS
    ? "gathering"
    : "outcome";
}

/**
 * Окончателен ли итог — то есть можно ли сжать строку.
 *
 * «Пришёл» после выхода окончательным не считается: с ним лидеру ещё
 * работать, и сжимать такую строку значит прятать несделанное. До выхода,
 * наоборот, это и есть вся работа.
 */
export function isSettled(
  result: AttendanceResult | null,
  phase: AttendancePhase,
): boolean {
  if (result === null) return false;
  if (result === "arrived") return phase === "gathering";
  return true;
}

export type AttendanceProgress = {
  total: number;
  /** Отмечен хоть как-то. */
  marked: number;
  /** Отмечен «Пришёл» — ждёт итога. */
  arrived: number;
  /**
   * Про кого лидер ещё не сказал последнего слова.
   *
   * В фазе сбора это просто неотмеченные. После выхода — они же плюс
   * «Пришёл»: строка «итог не проставлен у трёх» должна считать обоих, иначе
   * лидер, отметивший всех на сборе и забывший про итог, увидит «все
   * отмечены» и уйдёт.
   */
  unresolved: number;
};

export function attendanceProgress(
  results: (AttendanceResult | null)[],
  phase: AttendancePhase,
): AttendanceProgress {
  let marked = 0;
  let arrived = 0;
  let unresolved = 0;

  for (const result of results) {
    if (result !== null) marked += 1;
    if (result === "arrived") arrived += 1;
    if (!isSettled(result, phase)) unresolved += 1;
  }

  return { total: results.length, marked, arrived, unresolved };
}
