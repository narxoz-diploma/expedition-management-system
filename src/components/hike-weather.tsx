import { cardClass } from "@/components/ui";
import { formatDate, formatNumber, formatTime, NBSP } from "@/lib/hikes/format";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import {
  daysUntil,
  forecastWindow,
  rainLevel,
  shouldShowForecast,
  snowLevel,
  windLevel,
} from "@/lib/weather/forecast";
import { fetchRouteForecast } from "@/lib/weather/open-meteo";

/**
 * Прогноз на точке маршрута.
 *
 * Осознанно скучный вид: обычная карточка, без цветного фона и без иконок.
 * Зелёная плашка с солнышком читается как вердикт «идти можно», а решение
 * идти принимает лидер, а не сайт. Здесь только числа.
 *
 * Рендерить строго внутри <Suspense>: это поход в чужую сеть, и в общем
 * `Promise.all` страницы он добавил бы задержку Open-Meteo к каждому
 * открытию карточки — ровно та ошибка, которую уже лечили в docs/PERF.md.
 */
export async function HikeWeather({
  lat,
  lon,
  altitudeM,
  startsAt,
  durationHours,
  now,
}: {
  lat: number;
  lon: number;
  altitudeM: number;
  startsAt: string;
  durationHours: number | null;
  now: Date;
}) {
  if (!shouldShowForecast(startsAt, now)) return null;

  const [forecast, locale] = await Promise.all([
    fetchRouteForecast({
      lat,
      lon,
      altitudeM,
      startsAt,
      durationHours,
      daysAhead: daysUntil(startsAt, now),
    }),
    getLocale(),
  ]);
  if (!forecast) return null;
  const t = getDictionary(locale).weather;

  // То же окно, по которому свёрнуты числа, — чтобы подпись не разошлась
  // с тем, что показано.
  const span = forecastWindow(startsAt, durationHours);
  const unit = (value: number, symbol: string) =>
    `${formatNumber(value, locale)}${NBSP}${symbol}`;

  const temps =
    forecast.minTempC === forecast.maxTempC
      ? `${signed(forecast.minTempC)}${NBSP}°C`
      : `${signed(forecast.minTempC)}…${signed(forecast.maxTempC)}${NBSP}°C`;

  const rain = rainLevel(forecast.precipitationMm);
  const snow = snowLevel(forecast.snowfallCm);

  return (
    <section className={cardClass({ className: "mt-8" })}>
      {/* «В день похода», а не «на маршруте»: прежний заголовок читался как
          погода прямо сейчас, хотя это прогноз на дату выхода. Высота
          остаётся в заголовке — без неё числа читаются как городские, и
          человек оденется по окну. */}
      <h2 className="text-lg font-bold">
        {fill(t.title, { altitude: `${altitudeM}${NBSP}${t.meters}` })}
      </h2>

      {/* Окно, а не только дата: цифры описывают часы выхода, а не сутки, и
          именно поэтому расходятся с любым приложением погоды. */}
      <p className="mt-1 text-sm text-fg-muted">
        {fill(t.window, {
          date: formatDate(startsAt, locale),
          from: formatTime(startsAt, locale),
          to: formatTime(span.to.toISOString(), locale),
        })}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <Reading label={t.temp} value={temps} />
        <Reading label={t.feels} value={`${signed(forecast.minFeelsC)}${NBSP}°C`} />
        {/* Подпись под числом: «7 м/с» и «3 мм» ничего не говорят тому, кто
            идёт впервые. Слово называет силу, а не выносит приговор. Пороги
            одни на все языки — в lib/weather/forecast.ts. */}
        <Reading
          label={t.windUpTo}
          value={unit(forecast.maxWindMs, t.ms)}
          note={t.wind[windLevel(forecast.maxWindMs)]}
        />
        {forecast.snowfallCm > 0 ? (
          <Reading
            label={t.snow}
            value={unit(forecast.snowfallCm, t.cm)}
            note={snow && t.snowLevel[snow]}
          />
        ) : (
          <Reading
            label={t.precip}
            value={
              forecast.precipitationMm > 0 ? unit(forecast.precipitationMm, t.mm) : t.noPrecip
            }
            note={rain && t.rain[rain]}
          />
        )}
      </dl>

      {/* Постоянная строка, а не по условию: разница между городом и
          маршрутом и есть причина, по которой блок вообще существует. */}
      <p className="mt-4 text-sm text-fg-muted">
        {t.cityNote}
        {forecast.uncertain && t.uncertain}
      </p>
    </section>
  );
}

/** Минус рисуется сам, плюс приходится ставить руками. */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function Reading({
  label,
  value,
  note = null,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-fg">{value}</dd>
      {note && <dd className="text-sm text-fg-muted">{note}</dd>}
    </div>
  );
}
