import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatAgo,
  formatCost,
  formatDateWithWeekday,
  formatDeadline,
  formatNumber,
  formatTime,
  NBSP,
  pluralize,
} from "./format.ts";

const now = new Date("2026-08-19T20:00:00+06:00");
const ago = (minutes: number) =>
  formatAgo(new Date(now.getTime() - minutes * 60000).toISOString(), now);

describe("сколько прошло", () => {
  it("свежее округляет до «только что»", () => {
    assert.equal(ago(0), "только что");
    assert.equal(ago(0.5), "только что");
  });

  it("склоняет минуты", () => {
    assert.match(ago(1), /^1.минуту назад$/);
    assert.match(ago(22), /^22.минуты назад$/);
    assert.match(ago(40), /^40.минут назад$/);
  });

  it("склоняет часы", () => {
    assert.match(ago(60), /^1.час назад$/);
    assert.match(ago(180), /^3.часа назад$/);
    assert.match(ago(60 * 7), /^7.часов назад$/);
  });

  it("дальше суток отвечает датой", () => {
    // «Три дня назад» не помогает решить, пора ли напоминать, — а дата
    // и время говорят, застал ли человек сообщение до сна.
    assert.match(ago(60 * 30), /\d{1,2}/);
    assert.doesNotMatch(ago(60 * 30), /назад/);
  });
});

// 20 сентября 2026, 07:00 в Алматы — воскресенье.
const HIKE = "2026-09-20T07:00:00+05:00";

describe("даты по языку", () => {
  it("русский — как было, без «г.» у года", () => {
    assert.equal(formatDateWithWeekday(HIKE), "воскресенье, 20 сентября");
    assert.equal(formatDateWithWeekday(HIKE, true), "воскресенье, 20 сентября 2026");
  });

  it("английский и казахский — по своим правилам, в поясе клуба", () => {
    assert.equal(formatDateWithWeekday(HIKE, false, "en"), "Sunday 20 September");
    assert.match(formatDateWithWeekday(HIKE, false, "kk"), /20 қыркүйек/);
    assert.match(formatDateWithWeekday(HIKE, false, "kk"), /жексенбі/);
  });

  it("время — 24 часа на всех языках", () => {
    for (const locale of ["ru", "en", "kk"] as const) {
      assert.equal(formatTime(HIKE, locale), "07:00");
    }
  });
});

describe("числа по языку", () => {
  it("дробная часть: запятая по-русски и по-казахски, точка по-английски", () => {
    assert.equal(formatNumber(10.5), "10,5");
    assert.equal(formatNumber(10.5, "kk"), "10,5");
    assert.equal(formatNumber(10.5, "en"), "10.5");
    assert.equal(formatNumber(12, "en"), "12");
  });

  it("стоимость не разрывается посреди числа ни на одном языке", () => {
    assert.equal(formatCost(3000), `3${NBSP}000${NBSP}₸`);
    assert.equal(formatCost(3000, "en"), `3,000${NBSP}₸`);
    assert.doesNotMatch(formatCost(12500, "kk"), / /);
  });
});

describe("склонение по числу", () => {
  const spots = { one: "{n} место", few: "{n} места", many: "{n} мест", other: "{n} места" };
  const spotsEn = { one: "{n} spot", few: "{n} spots", many: "{n} spots", other: "{n} spots" };

  it("русский: одно, несколько, много — включая 11–14", () => {
    assert.equal(pluralize(1, spots), `1${NBSP}место`);
    assert.equal(pluralize(3, spots), `3${NBSP}места`);
    assert.equal(pluralize(5, spots), `5${NBSP}мест`);
    assert.equal(pluralize(11, spots), `11${NBSP}мест`);
    assert.equal(pluralize(21, spots), `21${NBSP}место`);
  });

  it("английский: one и other", () => {
    assert.equal(pluralize(1, spotsEn, "en"), `1${NBSP}spot`);
    assert.equal(pluralize(2, spotsEn, "en"), `2${NBSP}spots`);
  });

  it("форма без {n} — только слово, число не подставляется", () => {
    const hikes = { one: "поход", few: "похода", many: "походов", other: "похода" };
    assert.equal(pluralize(5, hikes), "походов");
  });
});

describe("срок с днём недели", () => {
  // Суббота, 12:00 по Алматы — закрытие записи из расписания автора.
  const closes = "2026-09-26T07:00:00.000Z";

  it("день недели в скобках, после даты", () => {
    assert.equal(formatDeadline(closes), "26 сентября (суббота), 12:00");
  });

  it("на английском — тоже", () => {
    assert.equal(formatDeadline(closes, "en"), "26 September (Saturday), 12:00");
  });
});
