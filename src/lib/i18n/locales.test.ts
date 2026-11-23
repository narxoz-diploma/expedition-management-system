// Запуск: npm run test:unit
//
// Здесь держится то, что сломать дороже всего: адреса, которые уже ходят по
// чатам клуба. Русская ссылка без приставки обязана открываться как раньше.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  localizeHref,
  pathWithoutLocale,
  resolveLocaleRoute,
  switchLocaleHref,
} from "./locales.ts";

describe("путь без приставки языка", () => {
  it("снимает любую приставку, включая внутренний /ru", () => {
    assert.equal(pathWithoutLocale("/ru/hikes"), "/hikes");
    assert.equal(pathWithoutLocale("/en/hikes/x"), "/hikes/x");
    assert.equal(pathWithoutLocale("/kk"), "/");
    assert.equal(pathWithoutLocale("/ru"), "/");
  });

  it("путь без приставки и похожие слова не трогает", () => {
    assert.equal(pathWithoutLocale("/hikes"), "/hikes");
    assert.equal(pathWithoutLocale("/"), "/");
    assert.equal(pathWithoutLocale("/english"), "/english");
  });
});

describe("proxy: что делать с адресом", () => {
  it("русский адрес без приставки переписывается внутрь /ru, а не уводится", () => {
    assert.deepEqual(resolveLocaleRoute("/"), { action: "rewrite", locale: "ru", pathname: "/ru" });
    assert.deepEqual(resolveLocaleRoute("/hikes/gorelnik-2026-09-13"), {
      action: "rewrite",
      locale: "ru",
      pathname: "/ru/hikes/gorelnik-2026-09-13",
    });
  });

  it("английский и казахский проходят как есть", () => {
    assert.deepEqual(resolveLocaleRoute("/en"), { action: "pass", locale: "en" });
    assert.deepEqual(resolveLocaleRoute("/en/hikes"), { action: "pass", locale: "en" });
    assert.deepEqual(resolveLocaleRoute("/kk/rules"), { action: "pass", locale: "kk" });
  });

  it("явный /ru уводится на адрес без приставки — у страницы один адрес", () => {
    assert.deepEqual(resolveLocaleRoute("/ru"), { action: "redirect", pathname: "/" });
    assert.deepEqual(resolveLocaleRoute("/ru/hikes"), { action: "redirect", pathname: "/hikes" });
  });

  it("экраны лидера всегда без языка: /en/admin уводится на /admin", () => {
    assert.deepEqual(resolveLocaleRoute("/en/admin/hikes"), {
      action: "redirect",
      pathname: "/admin/hikes",
    });
    assert.deepEqual(resolveLocaleRoute("/admin"), {
      action: "rewrite",
      locale: "ru",
      pathname: "/ru/admin",
    });
  });

  it("обработчик входа и служебные адреса Next не трогаются", () => {
    assert.equal(resolveLocaleRoute("/auth/callback").action, "pass");
    assert.equal(resolveLocaleRoute("/_next/static/x.js").action, "pass");
    assert.equal(resolveLocaleRoute("/__nextjs_original-stack-frame").action, "pass");
  });

  it("похожее на язык слово — не язык", () => {
    assert.deepEqual(resolveLocaleRoute("/english"), {
      action: "rewrite",
      locale: "ru",
      pathname: "/ru/english",
    });
    // «/administer» — не раздел лидера.
    assert.equal(resolveLocaleRoute("/en/administer").action, "pass");
  });
});

describe("внутренняя ссылка на текущем языке", () => {
  it("русский приставки не получает", () => {
    assert.equal(localizeHref("/hikes", "ru"), "/hikes");
    assert.equal(localizeHref("/", "ru"), "/");
  });

  it("английский получает, включая главную, запрос и якорь", () => {
    assert.equal(localizeHref("/hikes", "en"), "/en/hikes");
    assert.equal(localizeHref("/", "en"), "/en");
    assert.equal(localizeHref("/hikes?tab=past", "kk"), "/kk/hikes?tab=past");
    assert.equal(localizeHref("/?x=1", "en"), "/en?x=1");
    assert.equal(localizeHref("/#top", "en"), "/en#top");
  });

  it("экраны лидера, внешние ссылки, якоря и размеченные адреса — как есть", () => {
    assert.equal(localizeHref("/admin", "en"), "/admin");
    assert.equal(localizeHref("/admin/hikes/1", "en"), "/admin/hikes/1");
    assert.equal(localizeHref("https://www.instagram.com/narxozstepup/", "en"), "https://www.instagram.com/narxozstepup/");
    assert.equal(localizeHref("//cdn.example.com/x", "en"), "//cdn.example.com/x");
    assert.equal(localizeHref("#register", "en"), "#register");
    assert.equal(localizeHref("/kk/rules", "en"), "/kk/rules");
  });
});

describe("тот же адрес на другом языке", () => {
  it("туда и обратно, с запросом и якорем", () => {
    assert.equal(switchLocaleHref("/hikes?tab=past", "en"), "/en/hikes?tab=past");
    assert.equal(switchLocaleHref("/en/hikes?tab=past", "ru"), "/hikes?tab=past");
    assert.equal(switchLocaleHref("/kk/rules#x", "en"), "/en/rules#x");
  });

  it("главная не превращается в пустой адрес", () => {
    assert.equal(switchLocaleHref("/en", "ru"), "/");
    assert.equal(switchLocaleHref("/", "kk"), "/kk");
  });
});
