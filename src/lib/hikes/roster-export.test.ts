import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildContactsSheet,
  buildParticipantsSheet,
  type Cell,
} from "./roster-export.ts";
import type { RosterEntry } from "./roster.ts";

const entry = (over: Partial<RosterEntry> = {}): RosterEntry => ({
  userId: "u1",
  fullName: "Алия Первая",
  phone: "+77012345678",
  studyYear: 2,
  ageOnHike: 20,
  isMinor: false,
  status: "confirmed",
  waitlistPos: null,
  manualOverride: false,
  cancelledAt: null,
  fitnessLevel: 2,
  wasLateCancel: false,
  cancelledByLeader: false,
  asLeader: false,
  strikes: { total: 0, restricted: false, hikesLeft: null },
  noShowCount: 0,
  visitedPlaces: null,
  attendance: null,
  gear: null,
  emergencyContacts: [
    { fullName: "Мама", phone: "+77010000000", isParent: true },
  ],
  ...over,
});

/**
 * Главная проверка. Библиотека выгрузки падает на весь запрос, если значение
 * ячейки не совпадает с объявленным типом, — и именно так выгрузка сломалась
 * на проде: курс уходил числом с типом String.
 */
function assertCellTypesMatch(sheet: Cell[][], where: string) {
  sheet.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const at = `${where}, строка ${rowIndex + 1}, колонка ${colIndex + 1}`;
      if (cell.type === String) {
        assert.equal(
          typeof cell.value,
          "string",
          `${at}: тип String, а значение ${typeof cell.value} (${String(cell.value)})`,
        );
      }
      if (cell.type === Number) {
        assert.equal(
          typeof cell.value,
          "number",
          `${at}: тип Number, а значение ${typeof cell.value}`,
        );
      }
      if (cell.type === undefined) {
        assert.equal(typeof cell.value, "string", `${at}: заголовок не строка`);
      }
    });
  });
}

describe("выгрузка списка группы", () => {
  it("типы ячеек совпадают со значениями — лист «Группа»", () => {
    const sheet = buildParticipantsSheet([
      entry(),
      entry({ studyYear: null, phone: null, ageOnHike: null }),
      entry({ status: "waitlist", waitlistPos: 3, attendance: "no_show" }),
      entry({ manualOverride: true, noShowCount: 2, strikes: { total: 3, restricted: true, hikesLeft: 2 } }),
    ]);
    assertCellTypesMatch(sheet, "Группа");
  });

  it("типы ячеек совпадают со значениями — лист «На случай ЧП»", () => {
    const sheet = buildContactsSheet([
      entry(),
      entry({ emergencyContacts: [] }),
      entry({
        emergencyContacts: [
          { fullName: "Мама", phone: "+77010000000", isParent: true },
          { fullName: "Брат", phone: "+77020000000", isParent: false },
        ],
      }),
    ]);
    assertCellTypesMatch(sheet, "На случай ЧП");
  });

  it("«пришёл» не выглядит как неотмеченный", () => {
    // Пустая клетка в файле значит «лидер про него ничего не сказал».
    // Отмеченный на сборе, но без итога — это другое, и в горах, где файл и
    // читают, разница между ними важнее всего.
    const [, row] = buildParticipantsSheet([entry({ attendance: "arrived" })]);
    assert.equal(row[7].value, "пришёл");
  });

  it("курс приезжает строкой, хотя в базе он число", () => {
    const [, row] = buildParticipantsSheet([entry({ studyYear: 2 })]);
    assert.equal(row[3].value, "2");
    assert.equal(typeof row[3].value, "string");
  });

  it("пустые значения не превращаются в null или undefined", () => {
    const [, row] = buildParticipantsSheet([
      entry({ studyYear: null, ageOnHike: null, phone: null }),
    ]);
    for (const cell of row) {
      assert.ok(
        cell.value !== null && cell.value !== undefined,
        `в ячейке ${String(cell.value)}`,
      );
      assert.ok(!String(cell.value).includes("null"), "в файле оказалось «null»");
    }
  });

  it("человек без экстренного контакта не пропадает из файла", () => {
    const sheet = buildContactsSheet([entry({ emergencyContacts: [] })]);
    assert.equal(sheet.length, 2, "строка участника пропала");
    assert.equal(sheet[1][2].value, "НЕ УКАЗАН");
  });

  it("у участника с двумя контактами обе строки на месте", () => {
    const sheet = buildContactsSheet([
      entry({
        emergencyContacts: [
          { fullName: "Мама", phone: "+77010000000", isParent: true },
          { fullName: "Брат", phone: "+77020000000", isParent: false },
        ],
      }),
    ]);
    assert.equal(sheet.length, 3);
    assert.equal(sheet[1][4].value, "да", "родитель не отмечен");
    assert.equal(sheet[2][4].value, "");
  });

  it("телефон остаётся читаемым, а не числом", () => {
    const [, row] = buildParticipantsSheet([entry()]);
    assert.equal(row[2].value, "+7 701 234 56 78");
  });
});
