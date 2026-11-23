import assert from "node:assert/strict";
import { test } from "node:test";

import { decideMaintenance } from "./maintenance.ts";

test("выключенный режим пропускает всех, даже без токена", () => {
  assert.deepEqual(decideMaintenance(undefined, undefined, undefined, null), {
    action: "pass",
  });
  assert.deepEqual(decideMaintenance("true", undefined, undefined, "x"), {
    action: "block",
  });
});

test("верная кука пропускает", () => {
  assert.deepEqual(decideMaintenance("true", "secret", "secret", null), {
    action: "pass",
  });
});

test("чужая кука блокирует", () => {
  assert.deepEqual(decideMaintenance("true", "secret", "wrong", null), {
    action: "block",
  });
});

test("верный токен в адресе выдаёт обход, а не пропускает сразу", () => {
  // Пропуск сразу оставил бы токен в адресной строке — а рубильник как раз
  // и заводится ради записи экрана, где это заметно.
  assert.deepEqual(decideMaintenance("true", "secret", undefined, "secret"), {
    action: "grant-bypass",
    token: "secret",
  });
});

test("без включённого MAINTENANCE_MODE обход не нужен и не проверяется", () => {
  assert.deepEqual(
    decideMaintenance(undefined, "secret", undefined, "secret"),
    { action: "pass" },
  );
});
