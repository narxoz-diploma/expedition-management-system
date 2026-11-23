import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ageOn } from "../profile-age.ts";
import {
  isWaiverKind,
  waiverFileProblem,
  waiverKindForAge,
  waiverPath,
} from "./waiver.ts";

describe("какой бланк расписки показать", () => {
  it("совершеннолетнему — взрослый", () => {
    assert.equal(waiverKindForAge(19), "adult");
  });

  it("младшему — родительский", () => {
    assert.equal(waiverKindForAge(17), "minor");
  });

  it("ровно восемнадцать — уже взрослый", () => {
    assert.equal(waiverKindForAge(18), "adult");
  });

  it("возраст считается на день похода, а не на сегодня", () => {
    // Восемнадцать исполняются за неделю до выхода: на выходе человек
    // взрослый, и бланк ему нужен взрослый.
    const age = ageOn("2008-09-07", "2026-09-14T01:30:00.000Z");
    assert.equal(age, 18);
    assert.equal(waiverKindForAge(age), "adult");
  });

  it("а за неделю до дня рождения — ещё нет", () => {
    const age = ageOn("2008-09-21", "2026-09-14T01:30:00.000Z");
    assert.equal(age, 17);
    assert.equal(waiverKindForAge(age), "minor");
  });

  it("без даты рождения не гадает", () => {
    // Ошибка в сторону взрослого бланка — это поход несовершеннолетнего без
    // согласия родителя, поэтому здесь только честное «не знаю».
    assert.equal(waiverKindForAge(null), null);
  });
});

describe("файл бланка", () => {
  it("принимает PDF и Word", () => {
    assert.equal(waiverFileProblem({ name: "raspiska.pdf", size: 200_000 }), null);
    assert.equal(waiverFileProblem({ name: "Бланк.DOCX", size: 90_000 }), null);
  });

  it("отбивает картинку", () => {
    const problem = waiverFileProblem({ name: "photo.jpg", size: 100 });
    assert.match(String(problem), /PDF/);
  });

  it("отбивает файл без расширения", () => {
    assert.notEqual(waiverFileProblem({ name: "raspiska", size: 100 }), null);
  });

  it("отбивает слишком большой", () => {
    const problem = waiverFileProblem({ name: "scan.pdf", size: 11 * 1024 * 1024 });
    assert.match(String(problem), /10 МБ/);
  });
});

describe("путь бланка в хранилище", () => {
  it("плоский и с расширением в нижнем регистре", () => {
    assert.equal(waiverPath("adult", "abc", "Бланк.PDF"), "adult-abc.pdf");
  });

  it("различает взрослый бланк и детский", () => {
    assert.notEqual(
      waiverPath("adult", "x", "a.pdf"),
      waiverPath("minor", "x", "a.pdf"),
    );
  });

  it("две загрузки одного вида дают разные адреса", () => {
    // Иначе новый бланк лёг бы поверх старого, и у открывавших страницу
    // остался бы в кэше браузера прежний файл.
    assert.notEqual(
      waiverPath("adult", "x", "a.pdf"),
      waiverPath("adult", "y", "a.pdf"),
    );
  });
});

describe("вид бланка из адреса", () => {
  it("пропускает только два известных", () => {
    assert.equal(isWaiverKind("adult"), true);
    assert.equal(isWaiverKind("minor"), true);
    assert.equal(isWaiverKind("../secret"), false);
  });
});
