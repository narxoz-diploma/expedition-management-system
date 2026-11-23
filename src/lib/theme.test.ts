// Запуск: npm run test:unit
//
// Проверяется сама строка скрипта, который уходит в <head>, — не его копия.
// Поддельный window покрывает ровно то, что скрипт трогает. Настоящее
// «не мигает ли при загрузке» так не проверить: это только глазами.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import { THEME_COLORS, THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme.ts";

function run({
  stored = null,
  systemLight = false,
  storageThrows = false,
}: {
  stored?: string | null;
  systemLight?: boolean;
  storageThrows?: boolean;
}) {
  const attrs = new Map<string, string>();
  const metas: Map<string, string>[] = [];
  const store = new Map<string, string>();
  if (stored !== null) store.set(THEME_STORAGE_KEY, stored);
  const elements = new Map<string, unknown>();

  let mqListener: (() => void) | null = null;
  const mq = {
    matches: systemLight,
    addEventListener: (_: string, fn: () => void) => {
      mqListener = fn;
    },
  };

  const window = {
    matchMedia: () => mq,
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("SecurityError");
        return store.get(key) ?? null;
      },
    },
  } as Record<string, unknown>;

  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
    },
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: () => {
      const m = new Map<string, string>();
      metas.push(m);
      const el = {
        set id(value: string) {
          elements.set(value, el);
        },
        setAttribute: (k: string, v: string) => m.set(k, v),
      };
      return el;
    },
    head: { appendChild: () => {} },
  };

  vm.runInNewContext(THEME_SCRIPT, { window, document });

  return {
    theme: () => attrs.get("data-theme") ?? "dark",
    metaColors: () => metas.map((m) => m.get("content")),
    setSystem: (light: boolean) => {
      mq.matches = light;
      mqListener?.();
    },
    setStored: (value: string) => store.set(THEME_STORAGE_KEY, value),
  };
}

describe("тема до отрисовки", () => {
  it("без выбора светлая система даёт светлую тему", () => {
    const page = run({ systemLight: true });
    assert.equal(page.theme(), "light");
    assert.deepEqual(page.metaColors(), [THEME_COLORS.light]);
  });

  it("без выбора тёмная система даёт тёмную — без атрибута", () => {
    const page = run({ systemLight: false });
    assert.equal(page.theme(), "dark");
    assert.deepEqual(page.metaColors(), [THEME_COLORS.dark]);
  });

  it("свой выбор важнее системы — в обе стороны", () => {
    assert.equal(run({ stored: "dark", systemLight: true }).theme(), "dark");
    assert.equal(run({ stored: "light", systemLight: false }).theme(), "light");
  });

  it("мусор в хранилище считается «как в системе»", () => {
    assert.equal(run({ stored: "blue", systemLight: true }).theme(), "light");
  });

  it("недоступное хранилище не роняет скрипт", () => {
    // В приватном режиме части браузеров localStorage бросает. Упавший
    // скрипт оставил бы тёмную тему человеку со светлой системой.
    assert.equal(run({ storageThrows: true, systemLight: true }).theme(), "light");
  });

  it("смена системной темы подхватывается на лету, если выбора нет", () => {
    const page = run({ systemLight: false });
    page.setSystem(true);
    assert.equal(page.theme(), "light");
    // Тег полосы браузера один и тот же, а не новый на каждую смену.
    assert.deepEqual(page.metaColors(), [THEME_COLORS.light]);
  });

  it("смена системной темы не перебивает свой выбор", () => {
    const page = run({ systemLight: false });
    page.setStored("dark");
    page.setSystem(true);
    assert.equal(page.theme(), "dark");
  });
});
