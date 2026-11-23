import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { summarizeStrikes, type Strike } from "./strikes.ts";

const strike = (kind: Strike["kind"], weight: number, remaining: number): Strike => ({
  hikeId: `${kind}-${remaining}`,
  hikeTitle: "Проба",
  hikeSlug: "proba",
  hikeStartsAt: "2026-09-27T03:00:00.000Z",
  kind,
  weight,
  remaining,
  threshold: 2,
});

describe("сводка отметок", () => {
  it("нет отметок — нет очереди", () => {
    assert.deepEqual(summarizeStrikes([]), { total: 0, restricted: false, hikesLeft: null });
  });

  it("одна поздняя отмена — предупреждение, не очередь", () => {
    assert.deepEqual(summarizeStrikes([strike("late_cancel", 1, 2)]), {
      total: 1,
      restricted: false,
      hikesLeft: null,
    });
  });

  it("неявка — очередь на столько походов, сколько ей осталось", () => {
    assert.deepEqual(summarizeStrikes([strike("no_show", 2, 2)]), {
      total: 2,
      restricted: true,
      hikesLeft: 2,
    });
  });

  it("две поздние отмены — очередь, пока не сгорит первая", () => {
    // Сгорает старшая, и сумма падает ниже порога — дальше ждать не нужно.
    const summary = summarizeStrikes([strike("late_cancel", 1, 2), strike("late_cancel", 1, 1)]);
    assert.equal(summary.restricted, true);
    assert.equal(summary.hikesLeft, 1);
  });

  it("неявка и поздняя отмена — очередь до сгорания неявки", () => {
    // Сгорела поздняя отмена — неявка одна всё ещё на пороге.
    const summary = summarizeStrikes([strike("late_cancel", 1, 1), strike("no_show", 2, 2)]);
    assert.equal(summary.total, 3);
    assert.equal(summary.hikesLeft, 2);
  });
});
