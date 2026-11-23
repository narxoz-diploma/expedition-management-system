/**
 * Окно прогноза и свёртка почасовых значений в одну сводку.
 *
 * Почему почасовой прогноз, а не дневной: выход в 6:30, а дневная сводка
 * описывает день целиком — её максимум приходится на два часа дня, когда
 * группа уже спускается. Утро в горах к этой цифре отношения не имеет.
 *
 * Модуль без импортов приложения — иначе `node --test` спотыкается на `@/`.
 */

/** Дальше пяти дней прогноз в горах — гадание, и показывать его вредно. */
export const FORECAST_MAX_DAYS = 5;

/** После третьего дня цифры ещё поедут, и об этом надо предупредить. */
export const FORECAST_UNCERTAIN_AFTER_DAYS = 3;

/** Если лидер не указал длительность, считаем поход дневным. */
const DEFAULT_DURATION_HOURS = 12;

/** Больше суток окно не растягиваем: это уже не прогноз на выход. */
const MAX_DURATION_HOURS = 24;

const HOUR_MS = 3600 * 1000;

export type HourSample = {
  /** ISO в UTC. */
  time: string;
  temperatureC: number;
  feelsLikeC: number;
  windMs: number;
  precipitationMm: number;
  snowfallCm: number;
};

export type WeatherSummary = {
  minTempC: number;
  maxTempC: number;
  /** Минимум «ощущается как» — ветер на гребне важнее термометра. */
  minFeelsC: number;
  maxWindMs: number;
  precipitationMm: number;
  snowfallCm: number;
  /** Прогноз дальше третьего дня: цифры ещё изменятся. */
  uncertain: boolean;
};

/**
 * Подписи к числам.
 *
 * Голая цифра ничего не говорит тому, кто идёт впервые: «7 м/с» и «3 мм» —
 * это много или мало? Подпись называет силу привычными по сводкам словами
 * (градации те же, что у Казгидромета), чтобы опорная точка совпадала с
 * тем, что человек слышит в прогнозе по телевизору или видит в приложении.
 *
 * Именно называет, а не оценивает: ни «хорошо», ни «опасно», ни цвета. Идти
 * или не идти решает лидер — у него есть состав группы, снаряжение и
 * запасной маршрут, которых у сайта нет.
 */
export type WindLevel = "light" | "moderate" | "strong" | "veryStrong";
export type RainLevel = "light" | "moderate" | "heavy";
export type SnowLevel = "dusting" | "noticeable" | "heavy";

/*
 * Уровни — ключами, слова — в словаре языка. Пороги живут здесь одни на все
 * языки: разойдись они по переводам, «умеренный» по-русски и «strong»
 * по-английски описывали бы одну и ту же цифру.
 */
export function windLevel(ms: number): WindLevel {
  if (ms < 4) return "light";
  if (ms < 8) return "moderate";
  if (ms < 14) return "strong";
  return "veryStrong";
}

/** Осадки — суммой за окно похода, а не в час: столько выпадет за выход. */
export function rainLevel(mm: number): RainLevel | null {
  if (mm <= 0) return null;
  if (mm < 2) return "light";
  if (mm < 7) return "moderate";
  return "heavy";
}

export function snowLevel(cm: number): SnowLevel | null {
  if (cm <= 0) return null;
  if (cm < 1) return "dusting";
  if (cm < 5) return "noticeable";
  return "heavy";
}

const RU_WIND: Record<WindLevel, string> = {
  light: "слабый",
  moderate: "умеренный",
  strong: "сильный",
  veryStrong: "очень сильный",
};
const RU_RAIN: Record<RainLevel, string> = {
  light: "слабый дождь",
  moderate: "умеренный дождь",
  heavy: "сильный дождь",
};
const RU_SNOW: Record<SnowLevel, string> = {
  dusting: "припорошит",
  noticeable: "заметный снегопад",
  heavy: "сильный снегопад",
};

/** Русскими словами — пороги держатся тестами именно через эти функции. */
export function describeWind(ms: number): string {
  return RU_WIND[windLevel(ms)];
}

export function describeRain(mm: number): string | null {
  const level = rainLevel(mm);
  return level && RU_RAIN[level];
}

export function describeSnow(cm: number): string | null {
  const level = snowLevel(cm);
  return level && RU_SNOW[level];
}

/** Окно похода: от выхода на длительность, с разумным потолком. */
export function forecastWindow(
  startsAt: string,
  durationHours: number | null,
): { from: Date; to: Date } {
  const from = new Date(startsAt);
  const hours = Math.min(
    durationHours && durationHours > 0 ? durationHours : DEFAULT_DURATION_HOURS,
    MAX_DURATION_HOURS,
  );
  return { from, to: new Date(from.getTime() + hours * HOUR_MS) };
}

/** Сколько суток осталось до выхода; прошедший поход даёт отрицательное. */
export function daysUntil(startsAt: string, now: Date): number {
  return (new Date(startsAt).getTime() - now.getTime()) / (24 * HOUR_MS);
}

/**
 * Показывать ли прогноз вообще.
 *
 * Не показываем дальше пяти суток и после выхода: в первом случае это
 * гадание, во втором — уже не прогноз, а история.
 */
export function shouldShowForecast(startsAt: string, now: Date): boolean {
  const days = daysUntil(startsAt, now);
  return days >= 0 && days <= FORECAST_MAX_DAYS;
}

/**
 * Часы окна — в одну сводку. null, если в окно не попал ни один час:
 * лучше не показать блок совсем, чем показать пустую карточку.
 */
export function summarizeHours(
  samples: HourSample[],
  window: { from: Date; to: Date },
  daysAhead: number,
): WeatherSummary | null {
  // Час «06:00» описывает промежуток до 07:00, поэтому левую границу
  // округляем вниз: выход в 06:30 иначе потерял бы самый холодный час.
  const from = Math.floor(window.from.getTime() / HOUR_MS) * HOUR_MS;
  const to = window.to.getTime();

  const inWindow = samples.filter((sample) => {
    const t = new Date(sample.time).getTime();
    return Number.isFinite(t) && t >= from && t <= to;
  });
  if (inWindow.length === 0) return null;

  const round = (value: number) => Math.round(value);
  const round1 = (value: number) => Math.round(value * 10) / 10;

  return {
    minTempC: round(Math.min(...inWindow.map((h) => h.temperatureC))),
    maxTempC: round(Math.max(...inWindow.map((h) => h.temperatureC))),
    minFeelsC: round(Math.min(...inWindow.map((h) => h.feelsLikeC))),
    maxWindMs: round(Math.max(...inWindow.map((h) => h.windMs))),
    precipitationMm: round1(
      inWindow.reduce((sum, h) => sum + h.precipitationMm, 0),
    ),
    snowfallCm: round1(inWindow.reduce((sum, h) => sum + h.snowfallCm, 0)),
    uncertain: daysAhead > FORECAST_UNCERTAIN_AFTER_DAYS,
  };
}
