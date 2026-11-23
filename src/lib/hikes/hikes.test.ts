import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildAnnounce, buildCancellationAnnounce } from "./announce.ts";
import { clubLocalToUtcIso, utcIsoToClubLocal } from "./datetime.ts";
import {
  NBSP,
  formatCost,
  formatDate,
  formatDateWithWeekday,
  formatNumber,
  formatTime,
  pluralWithNumber,
} from "./format.ts";
import { buildHikeSlug, transliterate } from "./slug.ts";
import type { Hike } from "./types.ts";
import { isPastHike, spotsLeft, totalOnTrail } from "./types.ts";

const hike: Hike = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "kok-zhailau-2026-09-14",
  title: "Кок Жайляу",
  routeName: "Кок Жайляу",
  summary: null,
  description: null,
  category: 2,
  distanceKm: 12,
  elevationGainM: 700,
  durationHours: 6,
  // 01:30 UTC — это 06:30 в Алматы (UTC+5).
  startsAt: "2026-09-14T01:30:00.000Z",
  registrationOpensAt: null,
  registrationClosesAt: null,
  routeLat: null,
  routeLon: null,
  routeAltitudeM: null,
  capacity: 25,
  openToNewcomers: true,
  confirmedCount: 21,
  leaderCount: 1,
  waitlistCount: 0,
  costAmount: 3000,
  costNote: "вход в парк и такси, наличными на месте",
  coverUrl: null,
  status: "published",
  leaderId: "00000000-0000-0000-0000-000000000002",
  cancelledReason: null,
};

describe("часовой пояс клуба", () => {
  it("время показывается по Алматы, а не по UTC сервера", () => {
    assert.equal(formatTime(hike.startsAt), "06:30");
  });

  it("поход ранним утром не уезжает на предыдущий день", () => {
    // 20:00 UTC 13 сентября — это уже 01:00 14 сентября в Алматы.
    assert.equal(formatDate("2026-09-13T20:00:00.000Z"), "14 сентября");
  });
});

describe("время из формы и обратно", () => {
  it("6:30 по Алматы уходит в базу как 01:30 UTC", () => {
    assert.equal(
      clubLocalToUtcIso("2026-09-14T06:30"),
      "2026-09-14T01:30:00.000Z",
    );
  });

  it("час ночи по Алматы — это предыдущий день по UTC", () => {
    assert.equal(
      clubLocalToUtcIso("2026-09-14T01:00"),
      "2026-09-13T20:00:00.000Z",
    );
  });

  it("возвращает ровно то же значение обратно в форму", () => {
    for (const local of [
      "2026-09-14T06:30",
      "2026-01-01T00:00",
      "2026-12-31T23:59",
      "2027-06-15T12:00",
    ]) {
      assert.equal(
        utcIsoToClubLocal(clubLocalToUtcIso(local)),
        local,
        `не сошлось на ${local}`,
      );
    }
  });

  it("отказывается молча съедать мусор", () => {
    assert.throws(() => clubLocalToUtcIso("не дата"));
  });
});

describe("склонения", () => {
  const spots = (n: number) =>
    pluralWithNumber(n, "место", "места", "мест");

  it("считает места по-русски", () => {
    assert.equal(spots(1), `1${NBSP}место`);
    assert.equal(spots(4), `4${NBSP}места`);
    assert.equal(spots(5), `5${NBSP}мест`);
    assert.equal(spots(11), `11${NBSP}мест`);
    assert.equal(spots(21), `21${NBSP}место`);
    assert.equal(spots(0), `0${NBSP}мест`);
  });

  it("число и слово склеены неразрывным пробелом", () => {
    // Обычный пробел дал бы перенос строки между числом и словом.
    assert.ok(!spots(4).includes(" "), "остался обычный пробел");
  });

  it("сумму разбивает неразрывными пробелами", () => {
    assert.equal(formatCost(3000), `3${NBSP}000${NBSP}₸`);
    assert.ok(!formatCost(3000).includes(" "), "остался обычный пробел");
  });
});

describe("адрес похода", () => {
  it("транслитерирует русское название", () => {
    assert.equal(transliterate("Кок Жайляу"), "kok zhaylyau");
  });

  it("транслитерирует казахские буквы", () => {
    assert.equal(transliterate("Көкжайлау"), "kokzhaylau");
  });

  it("добавляет дату: на один маршрут ходят каждый семестр", () => {
    const a = buildHikeSlug("Кок Жайляу", "2026-09-14T01:30:00.000Z");
    const b = buildHikeSlug("Кок Жайляу", "2027-04-11T01:30:00.000Z");
    assert.equal(a, "kok-zhaylyau-2026-09-14");
    assert.notEqual(a, b, "два похода на один маршрут дали одинаковый адрес");
  });

  it("дата в адресе берётся по Алматы", () => {
    assert.match(
      buildHikeSlug("Пик Фурманова", "2026-09-13T20:00:00.000Z"),
      /-2026-09-14$/,
    );
  });

  it("не оставляет мусора от знаков препинания", () => {
    const slug = buildHikeSlug("Пик Фурманова (1-я попытка!)", "2026-09-14T01:30:00.000Z");
    assert.match(slug, /^[a-z0-9-]+$/, `в адресе посторонние знаки: ${slug}`);
    assert.ok(!slug.includes("--"), `сдвоенный дефис: ${slug}`);
  });
});

describe("свободные места", () => {
  it("считает остаток", () => {
    assert.equal(spotsLeft(hike), 4);
  });

  it("не уходит в минус, если лидер урезал вместимость", () => {
    assert.equal(spotsLeft({ ...hike, capacity: 20, confirmedCount: 21 }), 0);
  });
});

// В анонс сам адрес больше не попадает (см. announce.ts) — meeting здесь
// нужен только затем, чтобы buildAnnounce знал, что место сбора вообще
// назначено, и позвал за ним на страницу похода.
const meeting = { point: "у Атакента" };

describe("анонс для WhatsApp", () => {
  const text = buildAnnounce(
    hike,
    "https://step-up-gold.vercel.app/hikes/kok-zhailau-2026-09-14",
    meeting,
  );

  it("содержит всё, что нужно человеку в чате", () => {
    assert.match(text, /Кок Жайляу/);
    assert.match(text, /14 сентября/);
    assert.match(text, /Категория 2 из 5/);
    assert.match(text, /12 км/);
    assert.match(text, /набор 700 м/);
    assert.match(text, /06:30/);
    // Не «у Атакента» — сам адрес в анонс не идёт, только приглашение
    // посмотреть его на странице (см. announce.ts, почему).
    assert.match(text, /видно тем, кто записан/);
    assert.ok(!text.includes("у Атакента"), "адрес утёк в чат");
    assert.ok(text.includes(`3${NBSP}000${NBSP}₸`), "нет суммы расходов");
    assert.ok(
      text.includes(`Свободно 4${NBSP}места из 25`),
      "нет счётчика свободных мест",
    );
    assert.match(text, /Можно новичкам/);
    assert.match(text, /https:\/\/step-up-gold\.vercel\.app/);
  });

  it("не разваливается на незаполненном черновике", () => {
    const draft: Hike = {
      ...hike,
      routeName: null,
      distanceKm: null,
      elevationGainM: null,
      durationHours: null,
      costAmount: null,
      costNote: null,
      openToNewcomers: false,
    };
    const out = buildAnnounce(draft, "https://example.kz/h", { point: null });
    assert.ok(!out.includes("undefined"), out);
    assert.ok(!out.includes("null"), out);
    assert.match(out, /Кок Жайляу/, "осталось хотя бы название");
    assert.match(out, /Записаться: https/);
  });

  it("зовёт за распиской всегда, а не когда приложен бланк", () => {
    // Бумагу надо распечатать и подписать заранее, а несовершеннолетнему ещё
    // и дать родителю: узнавший о ней в день выхода приедет без неё.
    //
    // Прежде строка зависела от того, приложил ли лидер файлы, и забытая
    // загрузка убирала из анонса единственное упоминание бумаги, без которой
    // на сборе разворачивают. Расписка нужна на каждый поход — значит и
    // говорить о ней надо всегда, бланк тут ни при чём.
    assert.match(text, /расписк/i);
  });

  it("и говорит, что будет без неё", () => {
    // «Нужна расписка» без последствия читается как пожелание. Разворачивают
    // на сборе по-настоящему, и узнать об этом лучше из анонса в чате.
    assert.match(text, /не выпускаем/i);
  });

  it("когда мест нет — зовёт в лист ожидания, а не молчит", () => {
    const full = buildAnnounce(
      { ...hike, confirmedCount: 25 },
      "https://example.kz/h",
      meeting,
    );
    assert.match(full, /лист ожидания/);
  });
});

describe("объявление об отмене", () => {
  it("называет поход, дату и причину", () => {
    const out = buildCancellationAnnounce({
      ...hike,
      status: "cancelled",
      cancelledReason: "Штормовое предупреждение на выходные",
    });
    assert.match(out, /Кок Жайляу/);
    assert.match(out, /14 сентября/);
    assert.match(out, /Штормовое предупреждение/);
  });

  it("без причины не разваливается", () => {
    // Причину лидер может не написать: иногда объяснять нечего.
    const out = buildCancellationAnnounce({
      ...hike,
      status: "cancelled",
      cancelledReason: null,
    });
    assert.ok(!out.includes("undefined"), out);
    assert.ok(!out.includes("null"), out);
    assert.match(out, /отменяется/);
  });

  it("не обещает, что записи отменены", () => {
    // Отмена похода меняет только его статус — записи остаются, по ним лидер
    // и понимает, кого обзванивать. Обещать в чате обратное нельзя.
    const out = buildCancellationAnnounce({
      ...hike,
      status: "cancelled",
      cancelledReason: null,
    });
    assert.doesNotMatch(out, /Записи отменены/);
  });
});

describe("прошедший поход", () => {
  const now = new Date("2026-09-20T00:00:00.000Z");

  it("узнаётся по дате выхода", () => {
    assert.equal(isPastHike(hike, now), true);
    assert.equal(
      isPastHike({ ...hike, startsAt: "2026-09-27T01:30:00.000Z" }, now),
      false,
    );
  });

  it("считает всех, кто был на маршруте", () => {
    // Участники плюс лидеры: вместимость меряется участниками, а шли все.
    assert.equal(totalOnTrail(hike), 22);
  });

  it("отдаёт ноль, если состав неизвестен", () => {
    // Так выглядят исторические походы, залитые в базу без записей, —
    // подпись «Ходили 0 человек» показывать нельзя.
    assert.equal(
      totalOnTrail({ ...hike, confirmedCount: 0, leaderCount: 0 }),
      0,
    );
  });
});

describe("числа и даты по-русски", () => {
  it("дробное показывается через запятую", () => {
    // Точку ставит JS, и рядом с «3 000 ₸» она читается как чужая.
    assert.equal(formatNumber(10.5), "10,5");
    assert.equal(formatNumber(1.5), "1,5");
  });

  it("целое остаётся целым", () => {
    // «12 км», а не «12,0 км».
    assert.equal(formatNumber(12), "12");
    assert.equal(formatNumber(0), "0");
  });

  it("год показывается только когда его просят", () => {
    // У ближайших походов год очевиден, у прошедших — нет: вкладка истории
    // живёт несколько сезонов.
    assert.equal(
      formatDateWithWeekday("2026-05-18T04:00:00.000Z"),
      "понедельник, 18 мая",
    );
    // Без хвоста «г.»: он забирает место и переносит строку на карточке.
    assert.equal(
      formatDateWithWeekday("2026-05-18T04:00:00.000Z", true),
      "понедельник, 18 мая 2026",
    );
  });

  it("в анонсе километраж тоже с запятой", () => {
    const out = buildAnnounce(
      { ...hike, distanceKm: 12.5 },
      "https://example.kz/h",
      meeting,
    );
    assert.match(out, /12,5 км/);
    assert.doesNotMatch(out, /12\.5/);
  });
});
