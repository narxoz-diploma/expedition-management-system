// Запуск: npm run test:unit
//
// Эти строки — настоящие user-agent'ы, а не выдуманные. Проверка дешёвая и
// защищает от правки регулярок вслепую, но она НЕ заменяет проверку на живом
// телефоне: приложения меняют user-agent молча и без предупреждения.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isInAppBrowser } from "./in-app-browser.ts";

const IN_APP: [string, string][] = [
  [
    "WhatsApp на Android",
    "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36",
  ],
  [
    "WhatsApp на iOS",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ],
  [
    "Instagram на iOS",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113",
  ],
  [
    "Facebook на Android",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 [FBAN/EMA;FBAV/400.0]",
  ],
];

const REAL_BROWSER: [string, string][] = [
  [
    "Safari на iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  ],
  [
    "Chrome на Android",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
  ],
  [
    "Chrome на десктопе",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ],
];

describe("определение встроенного браузера", () => {
  for (const [name, ua] of IN_APP) {
    it(`${name} — встроенный, показываем баннер`, () => {
      assert.equal(isInAppBrowser(ua), true);
    });
  }

  for (const [name, ua] of REAL_BROWSER) {
    it(`${name} — настоящий браузер, баннер не нужен`, () => {
      assert.equal(isInAppBrowser(ua), false);
    });
  }

  it("пустой user-agent не считается встроенным браузером", () => {
    // Ошибаться надо в безопасную сторону: лишний баннер мешает,
    // но не блокирует, а вход по ссылке на почту доступен всегда.
    assert.equal(isInAppBrowser(""), false);
  });
});
