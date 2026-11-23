import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  filterDirectory,
  matchesQuery,
  type Filterable,
} from "./directory-filter.ts";

const person = (over: Partial<Filterable> = {}): Filterable => ({
  fullName: "Алия Первая",
  phone: "+77012345678",
  membershipStatus: "member",
  chatStatus: null,
  ...over,
});

describe("поиск по справочнику", () => {
  it("пустой запрос никого не отсекает", () => {
    assert.equal(matchesQuery(person(), ""), true);
    assert.equal(matchesQuery(person(), "   "), true);
  });

  it("находит по части имени, не глядя на регистр", () => {
    assert.equal(matchesQuery(person(), "али"), true);
    assert.equal(matchesQuery(person(), "ПЕРВ"), true);
    assert.equal(matchesQuery(person(), "вторая"), false);
  });

  it("находит по номеру, как его ни набери", () => {
    // Номер хранится как +77012345678, а набирают кто во что горазд.
    for (const query of ["701", "+7 701", "8 701 234", "5678", "701 234 56 78"]) {
      assert.equal(matchesQuery(person(), query), true, `не нашёл по «${query}»`);
    }
  });

  it("двух цифр мало", () => {
    // Иначе «12» выдаёт полклуба, и поиск бесполезен.
    assert.equal(matchesQuery(person(), "12"), false);
  });

  it("человека без номера цифрами не найти", () => {
    assert.equal(matchesQuery(person({ phone: null }), "701"), false);
  });
});

describe("фильтры справочника", () => {
  const people = [
    person({ fullName: "Участник", membershipStatus: "member" }),
    person({ fullName: "Гость", membershipStatus: "guest", phone: null }),
    person({ fullName: "Заявка", membershipStatus: "pending", phone: null }),
    person({ fullName: "Выпускник", membershipStatus: "alumni", phone: null }),
    person({ fullName: "В чате", membershipStatus: "member", chatStatus: "added", phone: null }),
  ];

  const names = (filter: Partial<Parameters<typeof filterDirectory>[1]> = {}) =>
    filterDirectory(people, {
      query: "",
      status: "all",
      notInChat: false,
      ...filter,
    }).map((p) => p.fullName);

  it("без фильтров отдаёт всех", () => {
    assert.equal(names().length, 5);
  });

  it("заявки идут вместе с гостями", () => {
    // Для лидера это один и тот же человек с улицы: разница лишь в том,
    // попросил он подтвердить членство или нет.
    assert.deepEqual(names({ status: "guest" }), ["Гость", "Заявка"]);
  });

  it("выпускники отдельной кнопкой", () => {
    assert.deepEqual(names({ status: "alumni" }), ["Выпускник"]);
  });

  it("«не в общем чате» отсекает отмеченных", () => {
    assert.equal(names({ notInChat: true }).includes("В чате"), false);
  });

  it("фильтры складываются с поиском", () => {
    assert.deepEqual(names({ status: "member", query: "участ" }), ["Участник"]);
  });
});
