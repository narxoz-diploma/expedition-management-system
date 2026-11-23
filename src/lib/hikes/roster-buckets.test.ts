import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bucketRoster, type RosterMember } from "./roster-buckets.ts";

const member = (over: Partial<RosterMember> = {}): RosterMember => ({
  userId: "u",
  status: "confirmed",
  asLeader: false,
  waitlistPos: null,
  cancelledAt: null,
  ...over,
});

const ids = (list: RosterMember[]) => list.map((e) => e.userId);

describe("раскладка состава", () => {
  it("снятый со-лидер не остаётся в блоке «Ведут»", () => {
    // Его запись отменяет триггер unsync_leader_registration, но флаг
    // as_leader на строке остаётся. Пока запрос отбрасывал отменённых, это
    // было незаметно; со строкой «отменились» фильтр по одному флагу вернул
    // бы бывшего лидера в состав ведущих.
    const result = bucketRoster([
      member({ userId: "now", asLeader: true }),
      member({
        userId: "was",
        asLeader: true,
        status: "cancelled",
        cancelledAt: "2026-08-18T10:00:00Z",
      }),
    ]);

    assert.deepEqual(ids(result.leaders), ["now"]);
  });

  it("снятого со-лидера не показывает и среди отменившихся", () => {
    // Блок «отменились» отвечает на вопрос «кто выпал из группы». Смена
    // ведущих — другое событие, и его место в «Кто ведёт».
    const result = bucketRoster([
      member({
        userId: "was",
        asLeader: true,
        status: "cancelled",
        cancelledAt: "2026-08-18T10:00:00Z",
      }),
    ]);

    assert.deepEqual(ids(result.cancelled), []);
  });

  it("передумавший и записавшийся снова идёт, а не отменился", () => {
    const result = bucketRoster([
      member({
        userId: "same",
        status: "cancelled",
        cancelledAt: "2026-08-17T10:00:00Z",
      }),
      member({ userId: "same", status: "confirmed" }),
    ]);

    assert.deepEqual(ids(result.cancelled), []);
    assert.deepEqual(ids(result.confirmed), ["same"]);
  });

  it("свежие отмены сверху", () => {
    const result = bucketRoster([
      member({ userId: "old", status: "cancelled", cancelledAt: "2026-08-10T10:00:00Z" }),
      member({ userId: "new", status: "cancelled", cancelledAt: "2026-08-18T10:00:00Z" }),
    ]);

    assert.deepEqual(ids(result.cancelled), ["new", "old"]);
  });

  it("очередь идёт по позициям, а не по времени записи", () => {
    const result = bucketRoster([
      member({ userId: "second", status: "waitlist", waitlistPos: 2 }),
      member({ userId: "first", status: "waitlist", waitlistPos: 1 }),
    ]);

    assert.deepEqual(ids(result.waitlist), ["first", "second"]);
  });

  it("лидер не считается участником", () => {
    // Иначе «Идут — N из M» показывало бы на одного больше, а лидер мест
    // участников не занимает.
    const result = bucketRoster([
      member({ userId: "lead", asLeader: true }),
      member({ userId: "person" }),
    ]);

    assert.deepEqual(ids(result.confirmed), ["person"]);
  });

  it("дважды отменивший — одна строка, последняя отмена", () => {
    // Живой случай: на «Горельнике» один человек стоял в «Отменились» дважды.
    const result = bucketRoster([
      member({ userId: "twice", status: "cancelled", cancelledAt: "2026-09-10T13:40:00Z" }),
      member({ userId: "other", status: "cancelled", cancelledAt: "2026-09-11T10:00:00Z" }),
      member({ userId: "twice", status: "cancelled", cancelledAt: "2026-09-12T21:57:00Z" }),
    ]);

    assert.deepEqual(ids(result.cancelled), ["twice", "other"]);
    assert.equal(result.cancelled[0].cancelledAt, "2026-09-12T21:57:00Z");
  });
});
