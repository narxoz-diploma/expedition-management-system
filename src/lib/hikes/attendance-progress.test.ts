import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  attendancePhase,
  attendanceProgress,
  isSettled,
} from "./attendance-progress.ts";

// Выход в 06:30 по Алматы — это 01:30 UTC.
const startsAt = "2026-09-14T01:30:00.000Z";

describe("фаза экрана явки", () => {
  it("на точке сбора — сбор", () => {
    // Час до выхода: окно отметок уже открыто, но спрашивать про итог
    // бессмысленно — группа ещё стоит на месте.
    assert.equal(
      attendancePhase(startsAt, new Date("2026-09-14T00:30:00.000Z")),
      "gathering",
    );
  });

  it("после выхода — итоги", () => {
    assert.equal(
      attendancePhase(startsAt, new Date("2026-09-14T08:00:00.000Z")),
      "outcome",
    );
  });

  it("опоздавший через час после выхода — ещё сбор", () => {
    // Иначе опоздавшего не отметить «Здесь», и лидер двигает время похода.
    assert.equal(
      attendancePhase(startsAt, new Date("2026-09-14T02:30:00.000Z")),
      "gathering",
    );
  });

  it("ровно через два часа после выхода — уже итоги", () => {
    assert.equal(
      attendancePhase(startsAt, new Date("2026-09-14T03:30:00.000Z")),
      "outcome",
    );
  });
});

describe("окончательность отметки", () => {
  it("«Пришёл» на сборе — это вся работа", () => {
    assert.equal(isSettled("arrived", "gathering"), true);
  });

  it("«Пришёл» после выхода — работа несделанная", () => {
    // Сжать такую строку значит спрятать от лидера то, к чему он обязан
    // вернуться: членство в клубе выдаёт только «Прошёл».
    assert.equal(isSettled("arrived", "outcome"), false);
  });

  it("неотмеченный не окончателен никогда", () => {
    assert.equal(isSettled(null, "gathering"), false);
    assert.equal(isSettled(null, "outcome"), false);
  });

  it("итог окончателен в любой фазе", () => {
    for (const phase of ["gathering", "outcome"] as const) {
      assert.equal(isSettled("completed", phase), true);
      assert.equal(isSettled("turned_back", phase), true);
      assert.equal(isSettled("no_show", phase), true);
    }
  });
});

describe("сводка по группе", () => {
  it("на сборе считает отмеченных", () => {
    const p = attendanceProgress(
      ["arrived", "arrived", "no_show", null],
      "gathering",
    );
    assert.equal(p.total, 4);
    assert.equal(p.marked, 3);
    assert.equal(p.unresolved, 1, "остался неотмеченный");
  });

  it("после выхода «Пришёл» считается непроставленным итогом", () => {
    // Иначе лидер, отметивший всех на сборе, увидит «все отмечены» и уйдёт,
    // а гости так и останутся гостями.
    const p = attendanceProgress(
      ["arrived", "arrived", "completed", "no_show", null],
      "outcome",
    );
    assert.equal(p.marked, 4);
    assert.equal(p.arrived, 2);
    assert.equal(p.unresolved, 3, "два «пришёл» и один неотмеченный");
  });

  it("пустая группа не ломает счёт", () => {
    const p = attendanceProgress([], "gathering");
    assert.deepEqual(p, { total: 0, marked: 0, arrived: 0, unresolved: 0 });
  });
});
