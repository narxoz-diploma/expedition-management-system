import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatRoutePoint, isShortMapLink, parseRoutePoint } from "./coords.ts";

describe("координаты точки маршрута", () => {
  it("разбирает то, что копируется из карт", () => {
    // Ровно этот вид даёт долгое нажатие на точку в Google Maps.
    assert.deepEqual(parseRoutePoint("43.12345, 76.98765"), {
      lat: 43.12345,
      lon: 76.98765,
    });
  });

  it("прощает разделители", () => {
    const expected = { lat: 43.12345, lon: 76.98765 };
    assert.deepEqual(parseRoutePoint("43.12345,76.98765"), expected);
    assert.deepEqual(parseRoutePoint("43.12345 76.98765"), expected);
    assert.deepEqual(parseRoutePoint("43.12345;76.98765"), expected);
    assert.deepEqual(parseRoutePoint("  43.12345 ,  76.98765  "), expected);
  });

  it("берёт целые числа и отрицательные", () => {
    assert.deepEqual(parseRoutePoint("43, 77"), { lat: 43, lon: 77 });
    assert.deepEqual(parseRoutePoint("-33.9, 18.4"), { lat: -33.9, lon: 18.4 });
  });

  it("достаёт координаты из ссылки Google Maps", () => {
    const pin =
      "https://www.google.com/maps/place/Кок+Жайляу/@43.1899,76.9781,15z/data=!3d43.18995!4d76.97812";
    // Пин точнее центра карты: центр смещается от одного жеста зума.
    assert.deepEqual(parseRoutePoint(pin), { lat: 43.18995, lon: 76.97812 });

    const center = "https://www.google.com/maps/@43.1899,76.9781,15z";
    assert.deepEqual(parseRoutePoint(center), { lat: 43.1899, lon: 76.9781 });
  });

  it("не понимает ссылку 2ГИС вместо того, чтобы понять её наоборот", () => {
    // Там порядок «долгота, широта», и для Алматы обе величины правдоподобны
    // как широта. Молча разобранная задом наперёд ссылка дала бы прогноз для
    // точки в Ираке, и заметить это было бы нечем.
    assert.equal(
      parseRoutePoint("https://2gis.kz/almaty/geo/9570784863939873/76.98,43.11"),
      null,
    );
  });

  it("отказывается от мусора", () => {
    assert.equal(parseRoutePoint(""), null);
    assert.equal(parseRoutePoint("   "), null);
    assert.equal(parseRoutePoint("Кок Жайляу"), null);
    assert.equal(parseRoutePoint("43.12345"), null, "одна координата — не точка");
    assert.equal(parseRoutePoint("43.1, 76.9, 2800"), null, "лишнее третье число");
  });

  it("отбивает запятую как десятичный разделитель", () => {
    // «43,12345, 76,98765» неразличимо: то ли две координаты, то ли четыре
    // числа. Лучше отказать, чем угадать не тот вариант.
    assert.equal(parseRoutePoint("43,12345, 76,98765"), null);
  });

  it("не пускает значения вне диапазона", () => {
    assert.equal(parseRoutePoint("143.5, 76.9"), null, "широта больше 90");
    assert.equal(parseRoutePoint("43.1, 276.5"), null, "долгота больше 180");
  });

  it("считает ровные нули мусором, а не точкой", () => {
    // Гвинейский залив — верный признак того, что вставили не то.
    assert.equal(parseRoutePoint("0, 0"), null);
    assert.equal(parseRoutePoint("0.0, 0.0"), null);
  });

  it("узнаёт короткую ссылку, но не притворяется, что разобрал её", () => {
    // Кнопка «Поделиться» в мобильном Google Maps даёт именно такую ссылку,
    // и координат в ней нет даже после редиректа: там идентификатор места.
    const short = "https://maps.app.goo.gl/zrPcZA1LhLth8nvB9";
    assert.equal(parseRoutePoint(short), null);
    assert.equal(isShortMapLink(short), true);
    assert.equal(isShortMapLink("https://goo.gl/maps/abc123"), true);
  });

  it("не путает короткую ссылку с обычной", () => {
    // У длинной координаты есть, и подсказка про «нет координат» была бы ложью.
    assert.equal(
      isShortMapLink("https://www.google.com/maps/@43.1899,76.9781,15z"),
      false,
    );
    assert.equal(isShortMapLink("43.12345, 76.98765"), false);
  });

  it("возвращается в поле тем же видом", () => {
    const point = { lat: 43.12345, lon: 76.98765 };
    assert.equal(formatRoutePoint(point), "43.12345, 76.98765");
    assert.deepEqual(parseRoutePoint(formatRoutePoint(point)), point);
  });
});
