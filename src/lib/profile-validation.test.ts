import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { profileInputSchema } from "./profile-validation.ts";

/** Заполненная форма совершеннолетнего — от неё отсчитываются остальные. */
function form(over: Record<string, string> = {}) {
  const year = new Date().getUTCFullYear();
  return {
    fullName: "Алия Первая",
    phone: "+7 701 234 56 78",
    birthDate: `${year - 20}-05-05`,
    studyYear: "2",
    visitedPlaces: "",
    fitnessLevel: "2",
    emergencyName: "Мама",
    emergencyPhone: "+7 701 000 00 00",
    consent: "on",
    ...over,
  };
}

/** Дата рождения человека, которому сейчас столько лет. */
function bornYearsAgo(years: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()),
  );
  // На день раньше, чтобы «ровно сегодня день рождения» не зависело от часа.
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

describe("контакт на случай ЧП", () => {
  it("свой же номер не принимает — даже записанный по-другому", () => {
    const result = profileInputSchema.safeParse(
      form({ phone: "+7 701 234 56 78", emergencyPhone: "8 (701) 234-56-78" }),
    );
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues[0].path, ["emergencyPhone"]);
    // Именно «свой номер», а не «не похоже на номер»: иначе тест прошёл бы
    // и на номере, который просто не распознался.
    assert.match(result.error?.issues[0].message ?? "", /твой номер/);
  });

  it("галочка «родитель» сохраняется как есть", () => {
    const parsed = profileInputSchema.parse(form({ emergencyIsParent: "on" }));
    assert.equal(parsed.emergencyIsParent, true);
  });

  it("без галочки взрослый проходит", () => {
    const parsed = profileInputSchema.parse(form());
    assert.equal(parsed.emergencyIsParent, false);
  });

  it("несовершеннолетнего без родителя не пускает", () => {
    // Первокурснику бывает 17, и контакт одноклассника в этой графе — это
    // ровно та ошибка, которая обнаруживается в худший момент.
    const result = profileInputSchema.safeParse(
      form({ birthDate: bornYearsAgo(17) }),
    );
    assert.equal(result.success, false);
    const issue = result.error?.issues.find(
      (i) => i.path[0] === "emergencyIsParent",
    );
    assert.ok(issue, "ошибка не привязана к галочке");
    assert.match(issue.message, /родител/i);
  });

  it("несовершеннолетнего с родителем пускает", () => {
    const result = profileInputSchema.safeParse(
      form({ birthDate: bornYearsAgo(17), emergencyIsParent: "on" }),
    );
    assert.equal(result.success, true);
  });

  it("ровно восемнадцать — уже сам себе взрослый", () => {
    const result = profileInputSchema.safeParse(
      form({ birthDate: bornYearsAgo(18) }),
    );
    assert.equal(result.success, true);
  });
});

describe("физическая форма", () => {
  it("без ответа профиль не проходит", () => {
    // Обязательное намеренно: иначе лидер не отличит «слабый» от «не
    // ответил», а это разные действия — одному написать, у другого спросить.
    const result = profileInputSchema.safeParse(form({ fitnessLevel: "" }));

    assert.equal(result.success, false);
    assert.ok(result.error?.issues.some((i) => i.path[0] === "fitnessLevel"));
  });

  it("принимает только три ступени", () => {
    assert.equal(profileInputSchema.safeParse(form({ fitnessLevel: "0" })).success, false);
    assert.equal(profileInputSchema.safeParse(form({ fitnessLevel: "4" })).success, false);
    for (const level of ["1", "2", "3"]) {
      const parsed = profileInputSchema.parse(form({ fitnessLevel: level }));
      assert.equal(parsed.fitnessLevel, Number(level));
    }
  });
});
