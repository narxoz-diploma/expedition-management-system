import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fullNameProblem, normalizeFullName } from "./full-name.ts";

describe("имя и фамилия", () => {
  it("пропускает обычные имена любого алфавита", () => {
    for (const name of [
      "Алия Первая",
      "Артём Останин",
      "Әсел Қайратқызы",
      "Анна-Мария Ли",
      "Шон О'Коннор",
      "Maria Garcia",
      "ван дер Берг Ян",
    ]) {
      assert.equal(fullNameProblem(name), null, name);
    }
  });

  it("одно слово — просит фамилию", () => {
    // Ник из Google приезжает в поле одним словом чаще всего.
    assert.match(fullNameProblem("Тест") ?? "", /фамили/);
    assert.match(fullNameProblem("dssolved") ?? "", /фамили/);
  });

  it("цифры, эмодзи и значки не проходят", () => {
    assert.ok(fullNameProblem("Аня 2005"));
    assert.ok(fullNameProblem("Аня🌸 Смирнова"));
    assert.ok(fullNameProblem("Аня_Смирнова Ивановна"));
  });

  it("инициалы и повтор одной буквы не проходят", () => {
    assert.ok(fullNameProblem("А. Иванов"));
    assert.ok(fullNameProblem("Ааа Ббб"));
  });

  it("пустое и из одних пробелов — спрашивает имя", () => {
    assert.equal(fullNameProblem("   "), "Как тебя зовут?");
  });

  it("лишние пробелы убираются, а не считаются ошибкой", () => {
    assert.equal(normalizeFullName("  Алия   Первая "), "Алия Первая");
    assert.equal(fullNameProblem("  Алия   Первая "), null);
  });

  it("сообщение — на языке страницы, а правило одно на все языки", () => {
    // Английскому и казахскому нельзя стать строже или мягче русского:
    // решение «годится ли имя» не должно зависеть от языка страницы.
    assert.match(fullNameProblem("dssolved", "en") ?? "", /last name/);
    assert.match(fullNameProblem("dssolved", "kk") ?? "", /тегіңді/);
    for (const locale of ["en", "kk"] as const) {
      assert.equal(fullNameProblem("Артём Останин", locale), null);
      assert.ok(fullNameProblem("Аня 2005", locale));
    }
  });
});
