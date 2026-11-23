/**
 * Запрос прогноза к Open-Meteo.
 *
 * Почему Open-Meteo: бесплатно, без ключа и без регистрации — то есть
 * переживает передачу проекта другому человеку, а ключ в переменных
 * окружения пережил бы её хуже.
 *
 * Главное здесь — параметр `elevation`. Без него сервис берёт высоту своей
 * ячейки сетки, а в горах она промахивается на сотни метров: ячейка вокруг
 * Алматы «знает» город, а не гребень над ним.
 */

import {
  forecastWindow,
  summarizeHours,
  type HourSample,
  type WeatherSummary,
} from "./forecast";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** С запасом над пятью днями окна: поход может кончаться на следующие сутки. */
const FORECAST_DAYS = 7;

/**
 * Час — столько же живёт прогноз у самого Open-Meteo, чаще спрашивать нечего.
 * Кэш здесь не про экономию запросов, а про то, чтобы карточка похода не
 * ходила в чужую сеть на каждое открытие.
 */
const CACHE_SECONDS = 3600;

type OpenMeteoResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    precipitation?: (number | null)[];
    snowfall?: (number | null)[];
  };
};

/** Часы, где хоть одно из нужных чисел пустое, просто выбрасываем. */
function toSamples(data: OpenMeteoResponse): HourSample[] {
  const hourly = data.hourly;
  const time = hourly?.time;
  if (!hourly || !Array.isArray(time)) return [];

  const at = (key: keyof NonNullable<OpenMeteoResponse["hourly"]>, i: number) => {
    const column = hourly[key];
    return Array.isArray(column) ? column[i] : null;
  };

  const samples: HourSample[] = [];
  for (let i = 0; i < time.length; i += 1) {
    const temperatureC = at("temperature_2m", i);
    const feelsLikeC = at("apparent_temperature", i);
    if (typeof temperatureC !== "number" || typeof feelsLikeC !== "number") {
      continue;
    }
    samples.push({
      // Ответ приходит без пояса (timezone=UTC), Date без «Z» прочитает его
      // как местное время машины — на Vercel это не то же самое.
      time: `${time[i]}Z`,
      temperatureC,
      feelsLikeC,
      windMs: typeof at("wind_speed_10m", i) === "number" ? Number(at("wind_speed_10m", i)) : 0,
      precipitationMm:
        typeof at("precipitation", i) === "number" ? Number(at("precipitation", i)) : 0,
      snowfallCm: typeof at("snowfall", i) === "number" ? Number(at("snowfall", i)) : 0,
    });
  }
  return samples;
}

/**
 * Сводка по окну похода — или null, если прогноз получить не удалось.
 *
 * Отказ намеренно тихий: человек открыл карточку ради похода, и строчка
 * «не удалось загрузить погоду» не даёт ему ничего, кроме тревоги. В логах
 * сервера отказ остаётся.
 */
export async function fetchRouteForecast(params: {
  lat: number;
  lon: number;
  altitudeM: number;
  startsAt: string;
  durationHours: number | null;
  daysAhead: number;
}): Promise<WeatherSummary | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", String(params.lat));
  url.searchParams.set("longitude", String(params.lon));
  url.searchParams.set("elevation", String(params.altitudeM));
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,wind_speed_10m,precipitation,snowfall",
  );
  // Ветер в м/с, а не в км/ч по умолчанию: местные прогнозы — Казгидромет,
  // приложения с русской локалью — говорят в м/с, и опорные точки («10 —
  // неприятно, 15 — идти тяжело») у человека уже привязаны к ним. Просим
  // сервис пересчитать сам, чтобы не округлять дважды.
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));

  try {
    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!response.ok) {
      console.error(`Open-Meteo ответил ${response.status}`);
      return null;
    }
    const samples = toSamples((await response.json()) as OpenMeteoResponse);
    return summarizeHours(
      samples,
      forecastWindow(params.startsAt, params.durationHours),
      params.daysAhead,
    );
  } catch (error) {
    console.error("Open-Meteo недоступен", error);
    return null;
  }
}
