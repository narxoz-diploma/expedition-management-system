/**
 * Отметки за позднюю отмену и неявку: что из них следует.
 *
 * Строки отметок отдаёт база (`strike_rows()` и обёртки над ней в миграции
 * 20260922120000_strikes.sql): только действующие, с весом, сколько походов
 * им осталось и порогом «только очередь». Здесь — сумма и главный для
 * человека вопрос: сколько ещё походов он записывается только в очередь.
 * Решает всё равно база — `place_registration()` смотрит на ту же сумму, —
 * а отсюда берёт текст экран.
 *
 * Модуль без импортов приложения — его гоняет `node --test`.
 */

export type StrikeKind = "late_cancel" | "no_show";

export type Strike = {
  hikeId: string;
  hikeTitle: string;
  hikeSlug: string;
  hikeStartsAt: string;
  kind: StrikeKind;
  weight: number;
  /** Сколько состоявшихся походов клуба отметке осталось жить. */
  remaining: number;
  threshold: number;
};

export type StrikeSummary = {
  total: number;
  restricted: boolean;
  /**
   * Через сколько походов клуба «только очередь» снимется само; null — её
   * нет. Отметки сгорают по одной, и снимается она, когда сумма опустится
   * ниже порога, а не когда сгорят все.
   */
  hikesLeft: number | null;
};

export function summarizeStrikes(strikes: Strike[]): StrikeSummary {
  const total = strikes.reduce((sum, strike) => sum + strike.weight, 0);
  const threshold = strikes[0]?.threshold ?? Infinity;
  if (total < threshold) return { total, restricted: false, hikesLeft: null };

  // Сгорают раньше те, кому меньше осталось. Снимаем по одной, пока сумма
  // не станет ниже порога, — тот момент и есть ответ.
  let left = total;
  for (const strike of [...strikes].sort((a, b) => a.remaining - b.remaining)) {
    left -= strike.weight;
    if (left < threshold) {
      return { total, restricted: true, hikesLeft: strike.remaining };
    }
  }
  // Недостижимо при весах больше нуля: после всех отметок сумма — ноль.
  return { total, restricted: true, hikesLeft: null };
}
