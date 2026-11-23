import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { hubPhase } from "./hub-phase.ts";

// Выход в 08:00 по Алматы — это 03:00 UTC.
const startsAt = "2026-09-20T03:00:00.000Z";
const at = (iso: string) => new Date(iso);

describe("фаза экрана группы", () => {
  // Запись закрывается в субботу в 12:00 — 07:00 UTC.
  const closes = "2026-09-19T07:00:00.000Z";

  it("пока запись открыта — набор", () => {
    assert.equal(
      hubPhase(
        { status: "published", startsAt, registrationClosesAt: closes },
        at("2026-09-19T06:00:00.000Z"),
      ),
      "recruiting",
    );
  });

  it("запись закрылась — день выхода", () => {
    // Граница — рубеж отмены: с него же отказ от места считается поздним.
    assert.equal(
      hubPhase(
        { status: "published", startsAt, registrationClosesAt: closes },
        at("2026-09-19T08:00:00.000Z"),
      ),
      "departure",
    );
  });

  it("без закрытия записи день выхода — за сутки", () => {
    assert.equal(
      hubPhase({ status: "published", startsAt, registrationClosesAt: null }, at("2026-09-19T02:00:00.000Z")),
      "recruiting",
    );
    assert.equal(
      hubPhase({ status: "published", startsAt, registrationClosesAt: null }, at("2026-09-19T04:00:00.000Z")),
      "departure",
    );
  });

  it("через час после выхода — ещё день выхода: отмечают опоздавших", () => {
    assert.equal(
      hubPhase({ status: "published", startsAt, registrationClosesAt: null }, at("2026-09-20T04:00:00.000Z")),
      "departure",
    );
  });

  it("через два часа после выхода — итог", () => {
    assert.equal(
      hubPhase({ status: "published", startsAt, registrationClosesAt: null }, at("2026-09-20T05:00:00.000Z")),
      "outcome",
    );
  });

  it("прошедший по статусу — итог, даже если дата по часам ещё впереди", () => {
    // Статус ставит база при первой отметке «Прошёл»; часам тут не верим.
    assert.equal(
      hubPhase({ status: "completed", startsAt, registrationClosesAt: null }, at("2026-09-19T03:00:00.000Z")),
      "outcome",
    );
  });

  it("черновик остаётся черновиком и после даты", () => {
    // Его никто не видел — итога у него нет, дело по-прежнему опубликовать
    // или удалить.
    assert.equal(
      hubPhase({ status: "draft", startsAt, registrationClosesAt: null }, at("2026-09-25T03:00:00.000Z")),
      "draft",
    );
  });

  it("отмена важнее даты в обе стороны", () => {
    assert.equal(
      hubPhase({ status: "cancelled", startsAt, registrationClosesAt: null }, at("2026-09-10T03:00:00.000Z")),
      "cancelled",
    );
    assert.equal(
      hubPhase({ status: "cancelled", startsAt, registrationClosesAt: null }, at("2026-09-25T03:00:00.000Z")),
      "cancelled",
    );
  });
});
