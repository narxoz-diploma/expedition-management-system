import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  gearGapForCategory,
  gearReadyUpTo,
  missingForCategory,
  promisedForCategory,
  type MyGearItem,
} from "./gear-readiness.ts";

/** Слепок реального справочника: важно, что категории идут неравномерно. */
const item = (
  slug: string,
  minHikeCategory: number,
  ownership: MyGearItem["ownership"],
): MyGearItem => ({
  id: slug,
  slug,
  name: slug,
  category: null,
  minHikeCategory,
  ownership,
});

const full: MyGearItem[] = [
  item("boots", 1, "own"),
  item("backpack", 1, "own"),
  item("rain", 1, "own"),
  item("warm", 2, "own"),
  item("firstaid", 2, "own"),
  item("poles", 3, "own"),
  item("headlamp", 3, "own"),
  item("spikes", 4, "own"),
  item("sleeping", 5, "own"),
];

const replace = (
  items: MyGearItem[],
  slug: string,
  ownership: MyGearItem["ownership"],
) => items.map((i) => (i.slug === slug ? { ...i, ownership } : i));

describe("готовность по снаряжению", () => {
  it("всё есть — готов до пятой", () => {
    assert.equal(gearReadyUpTo(full), 5);
  });

  it("нет спальника — готов до четвёртой", () => {
    assert.equal(gearReadyUpTo(replace(full, "sleeping", "none")), 4);
  });

  it("нет ботинок — не готов даже к первой", () => {
    assert.equal(gearReadyUpTo(replace(full, "boots", "none")), 0);
  });

  it("«достану» не считается за наличие", () => {
    // Обещание — не вещь. Раньше засчитывалось, и человек с пустым рюкзаком
    // получал зелёную цифру готовности.
    assert.equal(gearReadyUpTo(replace(full, "poles", "will_get")), 2);
  });

  it("пустой справочник не ломает расчёт", () => {
    assert.equal(gearReadyUpTo([]), 5);
  });

  it("нехватка на низкой категории перекрывает всё выше", () => {
    // Дырка во второй категории означает, что третья тоже недоступна,
    // даже если для неё самой всё собрано.
    const gaps = replace(full, "warm", "none");
    assert.equal(gearReadyUpTo(gaps), 1);
  });
});

describe("чего не хватает", () => {
  it("перечисляет только недостающее и только до нужной категории", () => {
    const gaps = replace(replace(full, "warm", "none"), "spikes", "none");
    const missing = missingForCategory(gaps, 3).map((i) => i.slug);
    assert.deepEqual(missing, ["warm"], "кошки для 4 категории сюда не входят");
  });

  it("когда всё собрано — пусто", () => {
    assert.deepEqual(missingForCategory(full, 5), []);
  });

  it("обещанное не попадает в недостающее", () => {
    // Иначе человек, уже договорившийся о палках, читает «купи палки».
    const gaps = replace(full, "poles", "will_get");
    assert.deepEqual(missingForCategory(gaps, 3), []);
  });
});

describe("что обещано достать", () => {
  it("перечисляет только обещанное и только до нужной категории", () => {
    const gaps = replace(replace(full, "warm", "will_get"), "spikes", "will_get");
    const promised = promisedForCategory(gaps, 3).map((i) => i.slug);
    assert.deepEqual(promised, ["warm"], "кошки для 4 категории сюда не входят");
  });

  it("«нет» сюда не попадает", () => {
    assert.deepEqual(promisedForCategory(replace(full, "warm", "none"), 3), []);
  });
});

describe("пробел в снаряжении для лидера", () => {
  it("у собранного человека пусто — строки на экране не будет", () => {
    assert.deepEqual(gearGapForCategory(full, 5), {
      missing: [],
      promised: [],
    });
  });

  it("разводит «нет» и «достану»: это два разных разговора", () => {
    const gaps = replace(replace(full, "warm", "none"), "poles", "will_get");
    assert.deepEqual(gearGapForCategory(gaps, 3), {
      missing: ["warm"],
      promised: ["poles"],
    });
  });

  it("молчит про снаряжение старших категорий", () => {
    // На прогулке первой категории кошки никого не касаются, и напоминать
    // о них значит приучить не читать эту строку вовсе.
    const gaps = replace(full, "spikes", "none");
    assert.deepEqual(gearGapForCategory(gaps, 1), {
      missing: [],
      promised: [],
    });
  });
});
