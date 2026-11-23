import assert from "node:assert/strict";
import { test } from "node:test";

import { firstName, waInviteUrl, waSpotOfferUrl } from "./wa-greeting.ts";

test("первое слово из полного имени", () => {
  assert.equal(firstName("Аружан Смагулова"), "Аружан");
});

test("лишние пробелы не мешают", () => {
  assert.equal(firstName("  Аружан   Смагулова "), "Аружан");
});

test("одно слово — оно и есть имя", () => {
  assert.equal(firstName("Аружан"), "Аружан");
});

test("пустая строка не роняет функцию", () => {
  assert.equal(firstName(""), "");
});

test("ссылка ведёт на номер без нецифровых символов", () => {
  const url = waInviteUrl("+7 701 234 56 78", "Аружан Смагулова");
  assert.ok(url.startsWith("https://wa.me/77012345678?text="));
});

test("текст содержит имя и обрывается на месте для ссылки", () => {
  const url = waInviteUrl("+77012345678", "Аружан Смагулова");
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.equal(text, "Привет, Аружан! Это Step Up — вот ссылка в чат: ");
});

test("без имени — приветствие без обращения, а не пустое место", () => {
  const url = waInviteUrl("+77012345678", "");
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.equal(text, "Привет! Это Step Up — вот ссылка в чат: ");
});

test("известная ссылка вписывается в текст сама", () => {
  const url = waInviteUrl(
    "+77012345678",
    "Аружан Смагулова",
    "https://chat.whatsapp.com/example",
  );
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.equal(
    text,
    "Привет, Аружан! Это Step Up — вот ссылка в чат: https://chat.whatsapp.com/example",
  );
});

test("предложение места из очереди — по имени и с названием похода", () => {
  const url = waSpotOfferUrl("+7 701 234 56 78", "Алия Сейткали", {
    title: "Гора Волчья",
    dateLabel: "воскресенье, 27 сентября",
  });
  assert.ok(url.startsWith("https://wa.me/77012345678?text="));
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.ok(text.startsWith("Привет, Алия!"));
  assert.ok(text.includes("«Гора Волчья», воскресенье, 27 сентября"));
});
