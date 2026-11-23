import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  registrationCta,
  type RegistrationCtaInput,
} from "./registration-cta.ts";

/** Открытый будущий поход и гость с улицы — от этого отсчитываются остальные. */
const base: RegistrationCtaInput = {
  past: false,
  signedIn: false,
  banned: false,
  membersOnly: false,
  registration: null,
  closedReason: null,
  missingProfileFields: [],
};

const cta = (over: Partial<RegistrationCtaInput> = {}) =>
  registrationCta({ ...base, ...over }).kind;

describe("что показать в блоке записи", () => {
  it("гостю на открытый поход — предложение войти", () => {
    assert.equal(cta(), "signIn");
  });

  it("вошедшему с полным профилем — кнопку записи", () => {
    assert.equal(cta({ signedIn: true }), "register");
  });

  it("вошедшему с пустым профилем — сначала профиль", () => {
    assert.equal(
      cta({ signedIn: true, missingProfileFields: ["телефон"] }),
      "profile",
    );
  });
});

describe("что важнее входа", () => {
  it("прошедший поход — блока нет вовсе", () => {
    // Гость получал «Войти и записаться» на выход, который был в марте.
    assert.equal(cta({ past: true }), "none");
    assert.equal(cta({ past: true, signedIn: true }), "none");
  });

  it("закрытая запись — причина, а не вход", () => {
    // Нажатие на «Войти и записаться» уводило на страницу входа и
    // возвращало к той же закрытой записи.
    assert.equal(cta({ closedReason: "Запись закрыта." }), "closed");
  });

  it("ещё не открытая запись — тоже причина", () => {
    assert.equal(cta({ closedReason: "Запись откроется 20 сентября." }), "closed");
  });
});

describe("что важнее состояния похода", () => {
  const registered: RegistrationCtaInput["registration"] = {
    status: "confirmed",
    waitlistPos: null,
    asLeader: false,
  };

  it("своя запись переживает закрытие окна", () => {
    // Отменяются чаще всего накануне выхода, когда запись давно закрыта.
    // Спрятать тут статус и кнопку отмены значит получить человека, который
    // просто не пришёл, — лидер узнает об этом на точке сбора.
    const state = registrationCta({
      ...base,
      signedIn: true,
      registration: registered,
      closedReason: "Запись закрыта.",
    });
    assert.equal(state.kind, "registered");
    assert.equal(state.kind === "registered" && state.confirmed, true);
  });

  it("лист ожидания тоже виден после закрытия", () => {
    const state = registrationCta({
      ...base,
      signedIn: true,
      closedReason: "Запись закрыта.",
      registration: { status: "waitlist", waitlistPos: 3, asLeader: false },
    });
    assert.equal(state.kind, "registered");
    assert.equal(state.kind === "registered" && state.waitlistPos, 3);
  });

  it("лидер похода узнаётся раньше обычной записи", () => {
    assert.equal(
      cta({
        signedIn: true,
        registration: { status: "confirmed", waitlistPos: null, asLeader: true },
      }),
      "leader",
    );
  });

  it("но прошедший поход важнее и записи", () => {
    assert.equal(cta({ past: true, signedIn: true, registration: registered }), "none");
  });

  it("отменённая запись за запись не считается", () => {
    assert.equal(
      cta({
        signedIn: true,
        registration: { status: "cancelled", waitlistPos: null, asLeader: false },
      }),
      "register",
    );
  });

  it("«только для участников» — раньше дат и раньше профиля", () => {
    // Новичок ждал открытия записи или дозаполнял профиль ради отказа
    // MEMBERS_ONLY после нажатия.
    assert.equal(
      cta({
        signedIn: true,
        membersOnly: true,
        closedReason: "Запись откроется 20 сентября.",
      }),
      "membersOnly",
    );
    assert.equal(
      cta({ signedIn: true, membersOnly: true, missingProfileFields: ["телефон"] }),
      "membersOnly",
    );
  });

  it("невошедшему «только для участников» не мешает войти", () => {
    // Он может оказаться участником — это известно только после входа.
    assert.equal(cta({ membersOnly: true }), "signIn");
  });

  it("своя запись и бан важнее «только для участников»", () => {
    assert.equal(
      cta({ signedIn: true, membersOnly: true, registration: registered }),
      "registered",
    );
    assert.equal(cta({ signedIn: true, membersOnly: true, banned: true }), "banned");
  });

  it("бан говорит о себе раньше, чем поход о своих датах", () => {
    // Иначе человек дождётся открытия записи и упрётся в то же самое.
    assert.equal(
      cta({
        signedIn: true,
        banned: true,
        closedReason: "Запись откроется 20 сентября.",
      }),
      "banned",
    );
  });
});
