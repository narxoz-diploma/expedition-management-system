import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buttonClass, chipDotClass, type ChipTone } from "./ui.ts";

/** Утилиты Tailwind, спорящие за одно свойство. */
const CONFLICTS = [
  ["bg-surface-raised", "bg-fg"],
  ["text-fg", "text-bg"],
];

describe("классы кнопки", () => {
  it("нажатое состояние не спорит с обычным", () => {
    // Дважды подряд подсветку дописывали классом поверх варианта, и оба раза
    // её не было видно: какая из двух утилит одного свойства победит, решает
    // порядок в стилях Tailwind, а не порядок в атрибуте. Тест смотрит на то,
    // чего не видят ни типы, ни линтер, ни сборка.
    const classes = buttonClass({ selected: true }).split(" ");

    for (const [base, active] of CONFLICTS) {
      assert.equal(
        classes.includes(base) && classes.includes(active),
        false,
        `${base} и ${active} стоят вместе — подсветка достанется тому, кто окажется позже в стилях`,
      );
    }
  });

  it("нажатая кнопка выглядит иначе обычной", () => {
    assert.notEqual(buttonClass({ selected: true }), buttonClass());
  });

  it("обычная кнопка остаётся прежней", () => {
    // selected по умолчанию выключен: полтора десятка мест вызова не должны
    // были поменяться от появления нового поля.
    assert.equal(buttonClass({ selected: false }), buttonClass());
  });
});

describe("чип статуса", () => {
  it("у состояния есть точка, у свойства — нет", () => {
    // «Можно новичкам» — не состояние похода, а его свойство: точка цвета
    // превращала бы приглашение в сигнал.
    const states: ChipTone[] = ["neutral", "success", "warning", "danger", "accent"];
    for (const tone of states) {
      assert.ok(chipDotClass(tone), `у тона ${tone} пропала точка`);
    }
    assert.equal(chipDotClass("outline"), null);
  });
});
