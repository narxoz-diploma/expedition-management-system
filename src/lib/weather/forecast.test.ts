import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  daysUntil,
  describeRain,
  describeSnow,
  describeWind,
  forecastWindow,
  shouldShowForecast,
  summarizeHours,
  type HourSample,
} from "./forecast.ts";

/** Час прогноза с нужными числами; остальное — безобидные нули. */
function hour(time: string, over: Partial<HourSample> = {}): HourSample {
  return {
    time,
    temperatureC: 0,
    feelsLikeC: 0,
    windMs: 0,
    precipitationMm: 0,
    snowfallCm: 0,
    ...over,
  };
}

// Выход 14 сентября в 06:30 по Алматы — это 01:30 UTC.
const STARTS_AT = "2026-09-14T01:30:00.000Z";

describe("окно прогноза", () => {
  it("тянется от выхода на длительность похода", () => {
    const w = forecastWindow(STARTS_AT, 6);
    assert.equal(w.from.toISOString(), "2026-09-14T01:30:00.000Z");
    assert.equal(w.to.toISOString(), "2026-09-14T07:30:00.000Z");
  });

  it("без длительности считает поход дневным", () => {
    // Поле необязательное, а окно нужно всегда.
    const w = forecastWindow(STARTS_AT, null);
    assert.equal(w.to.toISOString(), "2026-09-14T13:30:00.000Z");
  });

  it("не растягивается больше суток", () => {
    // Двухдневный поход — это уже не «прогноз на выход», и усреднять
    // сорок восемь часов в одну строку бессмысленно.
    const w = forecastWindow(STARTS_AT, 48);
    assert.equal(w.to.toISOString(), "2026-09-15T01:30:00.000Z");
  });
});

describe("когда прогноз показывается", () => {
  const now = new Date("2026-09-12T00:00:00.000Z");

  it("показывается в пределах пяти дней", () => {
    assert.equal(shouldShowForecast(STARTS_AT, now), true);
  });

  it("молчит дальше пяти дней", () => {
    // В горах это уже гадание, а выглядит как знание.
    assert.equal(
      shouldShowForecast("2026-09-20T01:30:00.000Z", now),
      false,
    );
  });

  it("молчит после выхода", () => {
    assert.equal(
      shouldShowForecast("2026-09-11T01:30:00.000Z", now),
      false,
    );
  });

  it("считает дни до выхода дробно", () => {
    assert.equal(Math.round(daysUntil(STARTS_AT, now) * 100) / 100, 2.06);
  });
});

describe("подписи к числам", () => {
  it("называет силу ветра по привычным градациям", () => {
    assert.equal(describeWind(0), "слабый");
    assert.equal(describeWind(3), "слабый");
    assert.equal(describeWind(4), "умеренный");
    assert.equal(describeWind(7), "умеренный");
    assert.equal(describeWind(8), "сильный");
    assert.equal(describeWind(13), "сильный");
    assert.equal(describeWind(14), "очень сильный");
  });

  it("молчит, когда осадков нет", () => {
    // Ноль подписывать нечем: рядом уже стоит «не ожидаются».
    assert.equal(describeRain(0), null);
    assert.equal(describeSnow(0), null);
  });

  it("делит осадки на три ступени", () => {
    assert.equal(describeRain(0.4), "слабый дождь");
    assert.equal(describeRain(3), "умеренный дождь");
    assert.equal(describeRain(12), "сильный дождь");
  });

  it("отдельно подписывает снег", () => {
    // Сантиметры снега и миллиметры дождя — разные величины, общей шкалой
    // их не подписать.
    assert.equal(describeSnow(0.5), "припорошит");
    assert.equal(describeSnow(3), "заметный снегопад");
    assert.equal(describeSnow(9), "сильный снегопад");
  });

  it("не выносит приговор", () => {
    // Ни «опасно», ни «хорошо»: решение идти принимает лидер, а не сайт.
    const all = [
      describeWind(25),
      describeRain(50),
      describeSnow(50),
    ].join(" ");
    for (const verdict of ["опасн", "нельзя", "хорош", "плох", "не ходи"]) {
      assert.equal(all.includes(verdict), false, `подпись оценивает: ${verdict}`);
    }
  });
});

describe("свёртка часов в сводку", () => {
  const window = forecastWindow(STARTS_AT, 6);

  it("берёт крайние значения по окну", () => {
    const summary = summarizeHours(
      [
        hour("2026-09-14T02:00:00Z", { temperatureC: -2, feelsLikeC: -9, windMs: 12 }),
        hour("2026-09-14T05:00:00Z", { temperatureC: 4, feelsLikeC: 1, windMs: 4 }),
      ],
      window,
      2,
    );
    assert.deepEqual(summary, {
      minTempC: -2,
      maxTempC: 4,
      minFeelsC: -9,
      maxWindMs: 12,
      precipitationMm: 0,
      snowfallCm: 0,
      uncertain: false,
    });
  });

  it("суммирует осадки, а не усредняет", () => {
    // Человеку важно, сколько выпадет за выход, а не средний час.
    const summary = summarizeHours(
      [
        hour("2026-09-14T02:00:00Z", { precipitationMm: 1.2, snowfallCm: 0.5 }),
        hour("2026-09-14T03:00:00Z", { precipitationMm: 0.8, snowfallCm: 1.5 }),
      ],
      window,
      2,
    );
    assert.equal(summary?.precipitationMm, 2);
    assert.equal(summary?.snowfallCm, 2);
  });

  it("не теряет час выхода при нецелом времени", () => {
    // Выход в 01:30 UTC, самый холодный час — 01:00. Округление границы
    // вверх выбросило бы ровно его.
    const summary = summarizeHours(
      [hour("2026-09-14T01:00:00Z", { temperatureC: -6 })],
      window,
      2,
    );
    assert.equal(summary?.minTempC, -6);
  });

  it("выкидывает часы за окном", () => {
    const summary = summarizeHours(
      [
        hour("2026-09-14T02:00:00Z", { temperatureC: 0 }),
        hour("2026-09-14T20:00:00Z", { temperatureC: 30 }),
      ],
      window,
      2,
    );
    assert.equal(summary?.maxTempC, 0, "вечерний час попал в утреннее окно");
  });

  it("отдаёт null, если в окно ничего не попало", () => {
    // Пустая карточка хуже её отсутствия.
    assert.equal(
      summarizeHours([hour("2026-09-20T02:00:00Z")], window, 2),
      null,
    );
    assert.equal(summarizeHours([], window, 2), null);
  });

  it("помечает дальний прогноз как неточный", () => {
    const near = summarizeHours([hour("2026-09-14T02:00:00Z")], window, 3);
    const far = summarizeHours([hour("2026-09-14T02:00:00Z")], window, 4);
    assert.equal(near?.uncertain, false);
    assert.equal(far?.uncertain, true);
  });
});
