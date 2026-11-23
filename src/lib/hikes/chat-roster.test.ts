import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { chatRoster, type ChatRow } from "./chat-roster.ts";

let seq = 0;

/** Записавшийся участник, которого лидер ещё не трогал. */
const row = (over: Partial<ChatRow> = {}): ChatRow => ({
  userId: `u${++seq}`,
  fullName: "Участник",
  phone: "+77011234567",
  status: "confirmed",
  asLeader: false,
  chatStatus: null,
  chatStatusAt: null,
  promotedAt: null,
  createdAt: `2026-08-0${seq % 9}T10:00:00Z`,
  cancelledAt: null,
  ...over,
});

/** Тот, кто открыл экран. В строках тестов его нет, если не сказано иное. */
const VIEWER = "viewer";

const names = (people: { userId: string }[]) => people.map((p) => p.userId);

describe("сборка чата похода", () => {
  it("в «добавить» попадают все, кого не трогали", () => {
    const a = row({ userId: "a" });
    const b = row({ userId: "b", chatStatus: "added" });
    const c = row({ userId: "c", chatStatus: "invited" });

    const result = chatRoster([a, b, c], VIEWER);

    assert.deepEqual(names(result.untouched), ["a"]);
    assert.deepEqual(names(result.waiting), ["c"]);
    // Ждущего в чате нет — он остаётся в работе, а не уезжает к сделанным.
    assert.deepEqual(names(result.active), ["a", "c"]);
    assert.deepEqual(names(result.done), ["b"]);
  });

  it("лидеры идут первыми и тоже требуют добавления", () => {
    const participant = row({ userId: "p", createdAt: "2026-08-01T10:00:00Z" });
    const leader = row({
      userId: "l",
      asLeader: true,
      createdAt: "2026-08-05T10:00:00Z",
    });

    const result = chatRoster([participant, leader], VIEWER);

    assert.deepEqual(names(result.active), ["l", "p"]);
    assert.equal(result.total, 2);
  });

  it("лист ожидания в чат не идёт", () => {
    // В чате похода — те, кто идёт. Стоящий в очереди узнает о месте, если
    // оно освободится, и попадёт туда уже поднявшимся.
    const result = chatRoster([row({ userId: "w", status: "waitlist" })], VIEWER);

    assert.deepEqual(names(result.active), []);
    assert.equal(result.total, 0);
  });

  it("отменившийся после добавления попадает в «убрать»", () => {
    // Сайт из WhatsApp никого не удалит — он может только сказать кого.
    const result = chatRoster([
      row({
        userId: "x",
        status: "cancelled",
        chatStatus: "added",
        cancelledAt: "2026-08-18T20:00:00Z",
      }),
    ], VIEWER);

    assert.deepEqual(names(result.toRemove), ["x"]);
  });

  it("отменившийся, которого не добавляли, не беспокоит лидера", () => {
    const result = chatRoster([
      row({ userId: "x", status: "cancelled", cancelledAt: "2026-08-18T20:00:00Z" }),
    ], VIEWER);

    assert.deepEqual(names(result.toRemove), []);
  });

  it("передумавший не оказывается разом в «добавить» и в «убрать»", () => {
    // Уникальность записей частичная: отменённая строка остаётся, а новая
    // запись создаётся рядом. Без склейки по человеку лидеру велели бы
    // убрать из чата того, кого он в тот же вечер добавляет.
    const result = chatRoster([
      row({
        userId: "same",
        status: "cancelled",
        chatStatus: "added",
        cancelledAt: "2026-08-18T20:00:00Z",
      }),
      row({ userId: "same", status: "confirmed", chatStatus: null }),
    ], VIEWER);

    assert.deepEqual(names(result.toRemove), []);
    assert.deepEqual(names(result.untouched), ["same"]);
  });

  it("поднявшийся из очереди помечен «ещё не знает»", () => {
    const result = chatRoster([
      row({ userId: "up", promotedAt: "2026-08-18T21:00:00Z" }),
      row({ userId: "self" }),
    ], VIEWER);

    assert.equal(result.active.find((p) => p.userId === "up")?.unaware, true);
    assert.equal(result.active.find((p) => p.userId === "self")?.unaware, false);
  });

  it("пометка снимается, как только лидер что-то сделал", () => {
    // Отметка и значит «я до него дошёл»: и «добавил», и «отправил ссылку»
    // предполагают, что человеку уже написали.
    const result = chatRoster([
      row({
        userId: "up",
        promotedAt: "2026-08-18T21:00:00Z",
        chatStatus: "invited",
      }),
    ], VIEWER);

    assert.equal(result.active[0].unaware, false);
  });

  it("свежие отмены сверху", () => {
    const result = chatRoster([
      row({
        userId: "old",
        status: "cancelled",
        chatStatus: "added",
        cancelledAt: "2026-08-10T10:00:00Z",
      }),
      row({
        userId: "new",
        status: "cancelled",
        chatStatus: "added",
        cancelledAt: "2026-08-18T10:00:00Z",
      }),
    ], VIEWER);

    assert.deepEqual(names(result.toRemove), ["new", "old"]);
  });
});

describe("кого экран не показывает", () => {
  it("себя в списке нет и в «осталось» не считается", () => {
    // Чат собирает создатель группы — он там по определению.
    const result = chatRoster(
      [
        row({ userId: VIEWER, asLeader: true }),
        row({ userId: "second", asLeader: true }),
        row({ userId: "p" }),
      ],
      VIEWER,
    );

    assert.deepEqual(names(result.active), ["second", "p"]);
    assert.equal(result.total, 2);
  });

  it("снятый лидер не попадает в «убрать из чата»", () => {
    const result = chatRoster(
      [
        row({
          userId: "l",
          asLeader: true,
          status: "cancelled",
          chatStatus: "added",
          cancelledAt: "2026-09-10T10:00:00Z",
        }),
      ],
      VIEWER,
    );

    assert.deepEqual(names(result.toRemove), []);
  });

  it("дважды отменившийся — одна строка, последняя отмена", () => {
    // Живой случай: «убрать 2 человека» с одним и тем же номером.
    const result = chatRoster(
      [
        row({
          userId: "twice",
          status: "cancelled",
          chatStatus: "added",
          cancelledAt: "2026-09-01T10:00:00Z",
        }),
        row({
          userId: "twice",
          status: "cancelled",
          chatStatus: "invited",
          cancelledAt: "2026-09-10T10:00:00Z",
        }),
      ],
      VIEWER,
    );

    assert.deepEqual(names(result.toRemove), ["twice"]);
    assert.equal(result.toRemove[0].cancelledAt, "2026-09-10T10:00:00Z");
  });
});

describe("сворачивание сделанного", () => {
  it("в чате уезжает из работы, ждущий остаётся", () => {
    // Ждущий выглядел бы как сделанный, а он не в чате: к нему надо
    // вернуться, и гасить его вместе с добавленными нельзя.
    const result = chatRoster([
      row({ userId: "done", chatStatus: "added", createdAt: "2026-08-01T10:00:00Z" }),
      row({ userId: "wait", chatStatus: "invited", createdAt: "2026-08-02T10:00:00Z" }),
      row({ userId: "fresh", createdAt: "2026-08-03T10:00:00Z" }),
    ], VIEWER);

    assert.deepEqual(names(result.done), ["done"]);
    assert.deepEqual(names(result.active), ["wait", "fresh"]);
    // В прогрессе считаются все трое: сделанное из знаменателя не уходит.
    assert.equal(result.total, 3);
  });
});
