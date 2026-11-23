import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  attendanceOpensAt,
  canMarkAttendance,
} from "./attendance-window.ts";

// Выход в 06:30 по Алматы — это 01:30 UTC.
const startsAt = "2026-09-14T01:30:00.000Z";

describe("окно отметок явки", () => {
  it("за месяц до похода отмечать нельзя", () => {
    // Ради этого всё и делалось: экран состава открыт с создания похода, и
    // случайное касание ставило человеку неявку со счётчиком.
    assert.equal(
      canMarkAttendance(startsAt, new Date("2026-08-14T10:00:00.000Z")),
      false,
    );
  });

  it("за три часа — ещё нельзя", () => {
    assert.equal(
      canMarkAttendance(startsAt, new Date("2026-09-13T22:30:00.000Z")),
      false,
    );
  });

  it("за полтора часа — уже можно: лидер отмечает на точке сбора", () => {
    assert.equal(
      canMarkAttendance(startsAt, new Date("2026-09-14T00:00:00.000Z")),
      true,
    );
  });

  it("ровно на границе — можно", () => {
    assert.equal(
      canMarkAttendance(startsAt, new Date("2026-09-13T23:30:00.000Z")),
      true,
    );
  });

  it("через неделю после похода — по-прежнему можно", () => {
    // Верхней границы нет намеренно: лидер добрался до телефона позже, и
    // запрещать тут нечего.
    assert.equal(
      canMarkAttendance(startsAt, new Date("2026-09-21T10:00:00.000Z")),
      true,
    );
  });

  it("момент открытия — ровно за два часа до выхода", () => {
    assert.equal(attendanceOpensAt(startsAt), "2026-09-13T23:30:00.000Z");
  });
});
