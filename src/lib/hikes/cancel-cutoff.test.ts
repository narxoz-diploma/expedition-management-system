import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { cancellationCutoff, isLateCancel } from "./cancel-cutoff.ts";

// Выход в воскресенье в 08:00 по Алматы — 03:00 UTC, запись закрывается в
// субботу в 12:00 — 07:00 UTC. Расписание автора.
const startsAt = "2026-09-27T03:00:00.000Z";
const closes = "2026-09-26T07:00:00.000Z";
const cutoff = cancellationCutoff({ startsAt, registrationClosesAt: closes });
const at = (iso: string) => new Date(iso);
const longAgo = "2026-09-24T07:15:00.000Z";

describe("рубеж отмены", () => {
  it("совпадает с закрытием записи", () => {
    assert.equal(cutoff, closes);
  });

  it("без закрытия записи — сутки до выхода", () => {
    assert.equal(
      cancellationCutoff({ startsAt, registrationClosesAt: null }),
      "2026-09-26T03:00:00.000Z",
    );
  });
});

describe("поздняя ли отмена", () => {
  const evening = at("2026-09-26T13:00:00.000Z"); // суббота, 18:00

  it("место с четверга, отмена вечером накануне — поздняя", () => {
    // Тот самый случай: 17 из 25, и по правилу «12 часов» ни одной.
    assert.equal(
      isLateCancel(cutoff, { status: "confirmed", spotSince: longAgo }, evening),
      true,
    );
  });

  it("до закрытия записи — не поздняя", () => {
    assert.equal(
      isLateCancel(
        cutoff,
        { status: "confirmed", spotSince: longAgo },
        at("2026-09-26T06:00:00.000Z"),
      ),
      false,
    );
  });

  it("из очереди — не поздняя", () => {
    assert.equal(
      isLateCancel(cutoff, { status: "waitlist", spotSince: longAgo }, evening),
      false,
    );
  });

  it("место досталось после рубежа — не поздняя", () => {
    assert.equal(
      isLateCancel(
        cutoff,
        { status: "confirmed", spotSince: "2026-09-26T12:00:00.000Z" },
        evening,
      ),
      false,
    );
  });
});
