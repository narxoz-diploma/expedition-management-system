// Тесты схемы. Запуск: npm run test:schema
//
// Миграции применяются к настоящему Postgres, собранному в WebAssembly
// (PGlite) — никакого Docker и никакого подключения к рабочей базе. Схемы
// auth.users и auth.uid() у Supabase свои, поэтому здесь для них заглушки:
// всё остальное — обычный Postgres, включая RLS, триггеры и SECURITY DEFINER.
//
// Чего эти тесты НЕ проверяют: конкурентность. PGlite однопоточный, и
// FOR UPDATE в register_for_hike() здесь ничем не нагрузить. Десять
// одновременных нажатий проверяются руками на настоящей базе — см. ROADMAP,
// срез 3.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

let db;
const uid = {};

/** Подставляет auth.uid(): дальше запросы идут от имени этого пользователя. */
const asUser = (id) =>
  db.exec(`select set_config('request.jwt.claim.sub', '${id}', false);`);

/** Проверяет, что вызов упал именно с ожидаемым кодом ошибки, а не любым. */
async function rejectsWith(code, fn) {
  try {
    await fn();
  } catch (e) {
    assert.match(String(e), new RegExp(code), `ожидалась ошибка ${code}`);
    return;
  }
  assert.fail(`ожидалась ошибка ${code}, но вызов прошёл успешно`);
}

before(async () => {
  db = await PGlite.create();

  // Заглушки Supabase: в голом Postgres их нет.
  await db.exec(`
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create role anon;
    create role authenticated;
  `);

  // Заглушка Supabase Storage. Миграция фотографий заводит бакеты и вешает
  // политики на storage.objects, а в голом Postgres этой схемы нет — без
  // заглушки падают ВСЕ схемные тесты, а не только про фотографии.
  //
  // Колонки повторяют настоящие лишь в той части, которую трогают политики:
  // задача стенда — проверить, что миграции применяются и что права на
  // hike_photos отобраны верно, а не воспроизвести Storage целиком.
  await db.exec(`
    create schema storage;
    create table storage.buckets (
      id     text primary key,
      name   text not null,
      public boolean not null default false
    );
    create table storage.objects (
      id        uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name      text not null,
      owner     uuid
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  // Права на storage.objects у Supabase выданы клиентским ролям заранее —
  // файлы там разграничивают политиками, а не грантами. В голом Postgres их
  // нет, и без этой строки политики бакетов проверить нечем: всё падало бы
  // на permission denied, не дойдя до RLS.

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  assert.ok(files.length > 0, "в supabase/migrations нет ни одного .sql");
  for (const f of files) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
});

after(async () => {
  await db?.close();
});

describe("миграции", () => {
  it("применяются целиком, сверху вниз", async () => {
    // Сам факт, что before() отработал, уже это доказывает. Проверим, что
    // ключевые объекты на месте, а не что файл просто не упал.
    const r = await db.query(`
      select count(*)::int c from pg_proc
       where proname in ('register_for_hike','cancel_registration','mark_attendance',
                         'register_participant','redeem_invite_code')
    `);
    assert.equal(r.rows[0].c, 5, "не все функции созданы");
  });

  it("включают RLS на всех таблицах с персональными данными", async () => {
    const r = await db.query(`
      select relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    assert.deepEqual(
      r.rows.map((x) => x.relname),
      [],
      "есть таблицы без RLS",
    );
  });
});

describe("профиль при первом входе", () => {
  it("создаётся триггером on_auth_user_created", async () => {
    for (const [key, name, email] of [
      ["leader", "Артём Лидер", "leader@narxoz.kz"],
      ["a", "Алия Первая", "a@narxoz.kz"],
      ["b", "Бекзат Второй", "b@narxoz.kz"],
      ["c", "Viktor Third", "c@narxoz.kz"],
    ]) {
      const r = await db.query(
        `insert into auth.users (email, raw_user_meta_data)
         values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
        [email, name],
      );
      uid[key] = r.rows[0].id;
    }
    const r = await db.query(`select count(*)::int c from profiles`);
    assert.equal(r.rows[0].c, 4);
  });

  it("берёт имя из метаданных Google", async () => {
    const r = await db.query(`select full_name from profiles where id = $1`, [
      uid.a,
    ]);
    assert.equal(r.rows[0].full_name, "Алия Первая");
  });

  it("не падает на not null, когда метаданных нет", async () => {
    const u = await db.query(
      `insert into auth.users (email) values ('noname@narxoz.kz') returning id`,
    );
    const r = await db.query(`select full_name from profiles where id = $1`, [
      u.rows[0].id,
    ]);
    assert.equal(r.rows[0].full_name, "noname");
  });

  it("profile_is_complete видит заполненный профиль", async () => {
    // Выполняется от роли postgres, которую guard_profile_privileges
    // пропускает — так же, как назначается первый админ.
    const ids = [uid.leader, uid.a, uid.b, uid.c];
    for (let i = 0; i < ids.length; i++) {
      await db.query(
        `update profiles
            set phone = $2, birth_date = '2006-01-01', consent_pd_at = now(),
                fitness_level = 2,
                membership_status = 'member'
          where id = $1`,
        [ids[i], `+7700000000${i}`],
      );
      await db.query(
        `insert into emergency_contacts (user_id, full_name, phone, is_parent)
         values ($1, 'Родитель', '+77010000000', true)`,
        [ids[i]],
      );
    }
    await db.query(`update profiles set role = 'leader' where id = $1`, [
      uid.leader,
    ]);

    const r = await db.query(`select profile_is_complete($1) v`, [uid.a]);
    assert.equal(r.rows[0].v, true);
  });
});

describe("запись в поход", () => {
  let hike;

  it("создаётся поход на одно место", async () => {
    const r = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('kok-zhailau-test', 'Кок Жайляу', 2, now() + interval '3 days', 1,
               'published', $1, true)
       returning id`,
      [uid.leader],
    );
    hike = r.rows[0].id;
    assert.ok(hike);
  });

  it("первый получает confirmed", async () => {
    await asUser(uid.a);
    const r = await db.query(`select * from register_for_hike($1)`, [hike]);
    assert.equal(r.rows[0].status, "confirmed");
  });

  it("второй уходит в лист ожидания на позицию 1", async () => {
    await asUser(uid.b);
    const r = await db.query(`select * from register_for_hike($1)`, [hike]);
    assert.equal(r.rows[0].status, "waitlist");
    assert.equal(r.rows[0].waitlist_pos, 1);
  });

  it("третий встаёт на позицию 2", async () => {
    await asUser(uid.c);
    const r = await db.query(`select * from register_for_hike($1)`, [hike]);
    assert.equal(r.rows[0].waitlist_pos, 2);
  });

  it("повторная запись отбивается", async () => {
    await asUser(uid.c);
    await rejectsWith("ALREADY_REGISTERED", () =>
      db.query(`select * from register_for_hike($1)`, [hike]),
    );
  });

  it("счётчики мест на hikes сходятся с registrations", async () => {
    const r = await db.query(
      `select confirmed_count, waitlist_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(r.rows[0].confirmed_count, 1);
    assert.equal(r.rows[0].waitlist_count, 2);
  });

  it("до registration_opens_at записаться нельзя", async () => {
    const f = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers, registration_opens_at)
       values ('future-test', 'Позже', 1, now() + interval '30 days', 20,
               'published', $1, true, now() + interval '7 days')
       returning id`,
      [uid.leader],
    );
    await asUser(uid.c);
    await rejectsWith("REGISTRATION_NOT_OPEN", () =>
      db.query(`select * from register_for_hike($1)`, [f.rows[0].id]),
    );
  });

  describe("отмена", () => {
    it("поднимает первого из очереди", async () => {
      await asUser(uid.a);
      const r = await db.query(`select * from cancel_registration($1)`, [hike]);
      assert.equal(r.rows[0].promoted_user_id, uid.b);
    });

    it("пересчитывает позиции очереди без дыр", async () => {
      const r = await db.query(
        `select waitlist_pos from registrations
          where hike_id = $1 and status = 'waitlist' order by waitlist_pos`,
        [hike],
      );
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].waitlist_pos, 1);
    });

    it("обновляет счётчики", async () => {
      const r = await db.query(
        `select confirmed_count, waitlist_count from hikes where id = $1`,
        [hike],
      );
      assert.equal(r.rows[0].confirmed_count, 1);
      assert.equal(r.rows[0].waitlist_count, 1);
    });
  });

  describe("ручная запись лидером", () => {
    it("лидер записывает alumni, которого система сама не пустит", async () => {
      await db.query(
        `update profiles set membership_status = 'alumni' where id = $1`,
        [uid.a],
      );
      await asUser(uid.leader);
      const r = await db.query(`select * from register_participant($1, $2)`, [
        hike,
        uid.a,
      ]);
      assert.equal(r.rows[0].status, "waitlist", "место занято — значит очередь");

      const f = await db.query(
        `select manual_override from registrations
          where hike_id = $1 and user_id = $2 and status <> 'cancelled'`,
        [hike, uid.a],
      );
      assert.equal(f.rows[0].manual_override, true);
    });

    it("alumni не записывается сам", async () => {
      await asUser(uid.a);
      await db.query(`select * from cancel_registration($1)`, [hike]);
      await rejectsWith("ALUMNI_NEEDS_MANUAL_APPROVAL", () =>
        db.query(`select * from register_for_hike($1)`, [hike]),
      );
    });

    it("чужой поход так не наполнить", async () => {
      await asUser(uid.c);
      await rejectsWith("FORBIDDEN", () =>
        db.query(`select * from register_participant($1, $2)`, [hike, uid.a]),
      );
    });
  });

  describe("отметка явки", () => {
    it("до похода отметить нельзя", async () => {
      // Экран состава открыт с создания похода, и кнопки на нём работали
      // всегда: случайное касание ставило живому человеку неявку со
      // счётчиком за месяц до выхода, и заметить это было некому.
      await asUser(uid.leader);
      await rejectsWith("HIKE_NOT_STARTED", () =>
        db.query(`select mark_attendance($1, $2, 'no_show')`, [hike, uid.c]),
      );
    });

    it("за полтора часа до выхода — уже можно", async () => {
      // Лидер отмечает пришедших на точке сбора, то есть до старта. Запас
      // в два часа существует ровно ради этого.
      await db.query(
        `update hikes set starts_at = now() + interval '90 minutes' where id = $1`,
        [hike],
      );
      await asUser(uid.leader);
      await db.query(`select mark_attendance($1, $2, 'completed')`, [
        hike,
        uid.c,
      ]);
      const r = await db.query(
        `select result from attendance where hike_id = $1 and user_id = $2`,
        [hike, uid.c],
      );
      assert.equal(r.rows[0].result, "completed");
    });

    it("двойное нажатие не накручивает no_show_count", async () => {
      await asUser(uid.leader);
      for (let i = 0; i < 3; i++) {
        await db.query(`select mark_attendance($1, $2, 'no_show')`, [
          hike,
          uid.c,
        ]);
      }
      const r = await db.query(
        `select no_show_count from profiles where id = $1`,
        [uid.c],
      );
      assert.equal(r.rows[0].no_show_count, 1);
    });

    it("исправление ошибки лидером откатывает счётчик", async () => {
      await db.query(`select mark_attendance($1, $2, 'completed')`, [
        hike,
        uid.c,
      ]);
      const r = await db.query(
        `select no_show_count from profiles where id = $1`,
        [uid.c],
      );
      assert.equal(r.rows[0].no_show_count, 0);
    });

    it("первый пройденный поход делает новичка членом клуба", async () => {
      await db.query(
        `update profiles set membership_status = 'guest' where id = $1`,
        [uid.b],
      );
      await asUser(uid.leader);
      await db.query(`select mark_attendance($1, $2, 'completed')`, [
        hike,
        uid.b,
      ]);
      const r = await db.query(
        `select membership_status, verification_method from profiles where id = $1`,
        [uid.b],
      );
      assert.equal(r.rows[0].membership_status, "member");
      assert.equal(r.rows[0].verification_method, "first_hike");
    });

    describe("снятие отметки", () => {
      it("возвращает «не отмечен» и откатывает счётчик неявок", async () => {
        // Раньше исправить промах можно было только другой отметкой: из трёх
        // ответов лидер выбирал наименее неправильный.
        await asUser(uid.leader);
        await db.query(`select mark_attendance($1, $2, 'no_show')`, [
          hike,
          uid.c,
        ]);
        const before = await db.query(
          `select no_show_count from profiles where id = $1`,
          [uid.c],
        );

        await db.query(`select clear_attendance($1, $2)`, [hike, uid.c]);

        const left = await db.query(
          `select 1 from attendance where hike_id = $1 and user_id = $2`,
          [hike, uid.c],
        );
        assert.equal(left.rows.length, 0, "отметка осталась");

        const after = await db.query(
          `select no_show_count from profiles where id = $1`,
          [uid.c],
        );
        assert.equal(
          after.rows[0].no_show_count,
          before.rows[0].no_show_count - 1,
          "счётчик неявок не откатился",
        );
      });

      it("повторное снятие молча проходит", async () => {
        // На морозе жмут дважды. Второй раз должен ничего не делать, а не
        // падать ошибкой в лицо.
        await asUser(uid.leader);
        await db.query(`select clear_attendance($1, $2)`, [hike, uid.c]);
      });

      it("снимает членство, выданное за этот же поход", async () => {
        // Иначе промах по кнопке «Прошёл» навсегда делал бы гостя участником
        // клуба, и откатить это было бы нечем.
        const before = await db.query(
          `select verification_method from profiles where id = $1`,
          [uid.b],
        );
        assert.equal(before.rows[0].verification_method, "first_hike", "предусловие");

        await asUser(uid.leader);
        await db.query(`select clear_attendance($1, $2)`, [hike, uid.b]);

        const after = await db.query(
          `select membership_status, verification_method from profiles where id = $1`,
          [uid.b],
        );
        assert.equal(after.rows[0].membership_status, "guest");
        assert.equal(after.rows[0].verification_method, null);
      });

      it("а подтверждённого другим способом не разжалует", async () => {
        // verification_method здесь и есть защита: по телефону, по коду и
        // вручную подтверждённых снятие отметки трогать не должно.
        await db.query(
          `update profiles set membership_status = 'member',
                                verification_method = 'phone_match'
             where id = $1`,
          [uid.c],
        );
        await asUser(uid.leader);
        await db.query(`select mark_attendance($1, $2, 'completed')`, [
          hike,
          uid.c,
        ]);
        await db.query(`select clear_attendance($1, $2)`, [hike, uid.c]);

        const r = await db.query(
          `select membership_status, verification_method from profiles where id = $1`,
          [uid.c],
        );
        assert.equal(r.rows[0].membership_status, "member");
        assert.equal(r.rows[0].verification_method, "phone_match");
      });

      it("посторонний снять отметку не может", async () => {
        await asUser(uid.a);
        await rejectsWith("FORBIDDEN", () =>
          db.query(`select clear_attendance($1, $2)`, [hike, uid.c]),
        );
      });
    });
  });
});

describe("привилегированные колонки профиля", () => {
  it("лидер не может выдать себе роль admin", async () => {
    await asUser(uid.leader);
    await db.exec(`set role authenticated`);
    try {
      await rejectsWith("FORBIDDEN_ROLE_CHANGE", () =>
        db.query(`update profiles set role = 'admin' where id = $1`, [
          uid.leader,
        ]),
      );
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("участник не может обнулить себе счётчик неявок", async () => {
    await db.query(`update profiles set no_show_count = 2 where id = $1`, [
      uid.c,
    ]);
    await asUser(uid.c);
    await db.exec(`set role authenticated`);
    try {
      await rejectsWith("FORBIDDEN_COUNTER_CHANGE", () =>
        db.query(`update profiles set no_show_count = 0 where id = $1`, [uid.c]),
      );
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("redeem_invite_code проходит сквозь защиту", async () => {
    await db.query(
      `insert into invite_codes (code, label) values ('OSEN2026', 'Осень 2026')`,
    );
    await db.query(
      `update profiles set membership_status = 'guest' where id = $1`,
      [uid.c],
    );
    await asUser(uid.c);
    const r = await db.query(`select redeem_invite_code($1) s`, ["  osen2026 "]);
    assert.equal(r.rows[0].s, "member");

    const used = await db.query(
      `select uses from invite_codes where code = 'OSEN2026'`,
    );
    assert.equal(used.rows[0].uses, 1, "использование списано за вступление");
  });

  it("повторный код у того, кто уже участник, использования не тратит", async () => {
    // Код на набор публикуется в группе и живёт с max_uses. Повтор из
    // любопытства («сработало ли?») отнимал место у того, кто ещё не вступил,
    // и код кончался раньше людей — причём молча, с ответом «готово».
    await asUser(uid.c);
    const r = await db.query(`select redeem_invite_code($1) s`, ["OSEN2026"]);
    assert.equal(r.rows[0].s, "member", "статус остался прежним");

    const used = await db.query(
      `select uses from invite_codes where code = 'OSEN2026'`,
    );
    assert.equal(used.rows[0].uses, 1, "счётчик не сдвинулся");
  });

  it("исчерпанный код не пускает", async () => {
    await db.query(
      `insert into invite_codes (code, max_uses, uses) values ('DONE2026', 1, 1)`,
    );
    await db.query(
      `update profiles set membership_status = 'guest' where id = $1`,
      [uid.b],
    );
    await asUser(uid.b);
    await rejectsWith("CODE_EXHAUSTED", () =>
      db.query(`select redeem_invite_code($1)`, ["DONE2026"]),
    );
  });
});

describe("несколько лидеров на поход", () => {
  let second;
  let hike;

  it("автор похода попадает в состав лидеров сам", async () => {
    const r = await db.query(
      `select hike_id from hike_leaders where user_id = $1`,
      [uid.leader],
    );
    assert.ok(r.rows.length > 0, "автор не попал в состав ни одного похода");
  });

  it("второй лидер получает доступ к экстренным контактам", async () => {
    // Заводим второго лидера и его же поход, чтобы не задеть прежние тесты.
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('second@narxoz.kz', jsonb_build_object('full_name','Второй лидер'))
       returning id`,
    );
    second = u.rows[0].id;
    await db.query(`update profiles set role = 'leader' where id = $1`, [second]);

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('two-leaders', 'С двумя лидерами', 2, now() + interval '10 days',
               10, 'published', $1, true)
       returning id`,
      [uid.leader],
    );
    hike = h.rows[0].id;

    // Участник записывается на этот поход.
    await db.query(
      `update profiles set membership_status = 'member' where id = $1`,
      [uid.b],
    );
    await asUser(uid.b);
    await db.query(`select * from register_for_hike($1)`, [hike]);

    // Пока второй лидер не в составе — контактов он не видит.
    await asUser(second);
    await db.exec(`set role authenticated`);
    let seen = await db.query(
      `select count(*)::int c from emergency_contacts where user_id = $1`,
      [uid.b],
    );
    await db.exec(`reset role`);
    assert.equal(seen.rows[0].c, 0, "чужие контакты видны до включения в состав");

    // Ответственный добавляет его в состав.
    await asUser(uid.leader);
    await db.query(`select add_hike_leader($1, $2)`, [hike, second]);

    await asUser(second);
    await db.exec(`set role authenticated`);
    seen = await db.query(
      `select count(*)::int c from emergency_contacts where user_id = $1`,
      [uid.b],
    );
    await db.exec(`reset role`);
    assert.ok(
      seen.rows[0].c > 0,
      "лидер на маршруте не видит экстренные контакты своей группы",
    );
  });

  it("второй лидер видит список записавшихся", async () => {
    await asUser(second);
    await db.exec(`set role authenticated`);
    const r = await db.query(
      `select count(*)::int c from registrations where hike_id = $1`,
      [hike],
    );
    await db.exec(`reset role`);
    assert.ok(r.rows[0].c > 0, "список группы не виден");
  });

  it("лидер чужого похода контактов не видит", async () => {
    // Тот же человек, но поход, в котором он не значится.
    await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('not-mine', 'Чужой', 1, now() + interval '11 days', 10,
               'published', $1, true)
       returning id`,
      [uid.c],
    );
    // Записывать uid.c на свой поход не нужно и уже нельзя: с миграции
    // 20260805 автор попадает в состав лидеров, а состав сам создаёт запись.
    await asUser(uid.c);
    await db.query(
      `update profiles set membership_status = 'member' where id = $1`,
      [uid.c],
    );

    await asUser(second);
    await db.exec(`set role authenticated`);
    const r = await db.query(
      `select count(*)::int c from emergency_contacts where user_id = $1`,
      [uid.c],
    );
    await db.exec(`reset role`);
    assert.equal(r.rows[0].c, 0, "виден чужой поход");
  });

  it("состав меняет только ответственный", async () => {
    await asUser(second);
    try {
      await db.query(`select add_hike_leader($1, $2)`, [hike, uid.c]);
    } catch (e) {
      assert.match(String(e), /FORBIDDEN/);
      return;
    }
    assert.fail("не ответственный поменял состав лидеров");
  });

  it("в лидеры нельзя записать обычного участника", async () => {
    await asUser(uid.leader);
    await assert.rejects(
      () => db.query(`select add_hike_leader($1, $2)`, [hike, uid.a]),
      /NOT_A_LEADER/,
    );
  });

  it("ответственного из состава не убрать", async () => {
    // Иначе группа осталась бы без единого лидера с доступом к контактам.
    await asUser(uid.leader);
    await assert.rejects(
      () => db.query(`select remove_hike_leader($1, $2)`, [hike, uid.leader]),
      /CANNOT_REMOVE_RESPONSIBLE/,
    );
  });

  it("второго лидера убрать можно, и доступ пропадает", async () => {
    await asUser(uid.leader);
    await db.query(`select remove_hike_leader($1, $2)`, [hike, second]);

    await asUser(second);
    await db.exec(`set role authenticated`);
    const r = await db.query(
      `select count(*)::int c from emergency_contacts where user_id = $1`,
      [uid.b],
    );
    await db.exec(`reset role`);
    assert.equal(r.rows[0].c, 0, "доступ остался после исключения из состава");
  });
});

describe("членство в клубе", () => {
  let newcomer;

  it("список номеров подтверждает тех, кто уже зарегистрировался", async () => {
    // Человек завёл профиль до того, как лидер вставил список.
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('early@narxoz.kz', jsonb_build_object('full_name','Ранний')) returning id`,
    );
    const early = u.rows[0].id;
    await db.query(`update profiles set phone = '+77015550001' where id = $1`, [
      early,
    ]);

    await asUser(uid.leader);
    const r = await db.query(
      `select * from add_known_member_phones($1::text[], 'группа осень 2026')`,
      [["+77015550001", "+77015550002"]],
    );
    assert.equal(r.rows[0].added, 2, "добавлено номеров");
    assert.equal(r.rows[0].matched_now, 1, "подтверждено сразу");

    const p = await db.query(
      `select membership_status, verification_method from profiles where id = $1`,
      [early],
    );
    assert.equal(p.rows[0].membership_status, "member", "статус");
    assert.equal(p.rows[0].verification_method, "phone_match", "способ");
  });

  it("и тех, кто зарегистрируется потом — без участия лидера", async () => {
    // Это и есть дыра, ради которой номера хранятся, а не применяются разом.
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('late@narxoz.kz', jsonb_build_object('full_name','Поздний')) returning id`,
    );
    newcomer = u.rows[0].id;

    let p = await db.query(`select membership_status from profiles where id = $1`, [
      newcomer,
    ]);
    assert.equal(p.rows[0].membership_status, "guest", "сразу после регистрации");

    await asUser(newcomer);
    await db.exec(`set role authenticated`);
    await db.query(`update profiles set phone = '+77015550002' where id = $1`, [
      newcomer,
    ]);
    await db.exec(`reset role`);

    p = await db.query(
      `select membership_status, verification_method from profiles where id = $1`,
      [newcomer],
    );
    assert.equal(p.rows[0].membership_status, "member", "после указания телефона");
    assert.equal(p.rows[0].verification_method, "phone_match", "способ");
  });

  it("чужой номер участником не делает", async () => {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('stranger@narxoz.kz', jsonb_build_object('full_name','Чужой')) returning id`,
    );
    const stranger = u.rows[0].id;
    await asUser(stranger);
    await db.exec(`set role authenticated`);
    await db.query(`update profiles set phone = '+77019999999' where id = $1`, [
      stranger,
    ]);
    await db.exec(`reset role`);

    const p = await db.query(
      `select membership_status from profiles where id = $1`,
      [stranger],
    );
    assert.equal(p.rows[0].membership_status, "guest", "остался гостем");
  });

  it("список номеров вставляет только лидер", async () => {
    await asUser(uid.c);
    try {
      await db.query(`select * from add_known_member_phones($1::text[])`, [
        ["+77015550003"],
      ]);
    } catch (e) {
      if (!String(e).includes("FORBIDDEN")) throw e;
      return;
    }
    throw new Error("участник вставил список номеров");
  });

  it("иностранный номер в список тоже попадает", async () => {
    // 29 августа 2026 лидер вставлял группу, и индонезийский номер отвалился.
    // Формат был прибит к +7 и десяти цифрам — а тем же валидатором
    // проверяется телефон в профиле и контакт на случай ЧП, так что студент
    // не мог ни записаться в поход, ни вписать родителя.
    await asUser(uid.leader);
    const r = await db.query(
      `select * from add_known_member_phones($1::text[])`,
      [["+6281234567890", "+79123456789"]],
    );
    assert.equal(r.rows[0].added, 2, "добавлено номеров");
  });

  it("а бессмыслица с плюсом — нет", async () => {
    // Код страны с нуля не начинается ни у кого, и три цифры номером не
    // бывают. Функция такие молча отсеивает, не роняя вставку целиком.
    await asUser(uid.leader);
    const r = await db.query(
      `select * from add_known_member_phones($1::text[])`,
      [["+0123456789", "+123"]],
    );
    assert.equal(r.rows[0].added, 0);
  });

  it("и в саму таблицу такое не положить", async () => {
    await rejectsWith("known_member_phones_format", () =>
      db.query(`insert into known_member_phones (phone) values ('+123')`),
    );
  });

  it("заявка переводит гостя в очередь и не даёт прав", async () => {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('applicant@narxoz.kz', jsonb_build_object('full_name','Заявитель')) returning id`,
    );
    const applicant = u.rows[0].id;

    await asUser(applicant);
    const r = await db.query(`select request_membership() s`);
    assert.equal(r.rows[0].s, "pending", "статус после заявки");

    // Повторная заявка не должна множить состояния.
    try {
      await db.query(`select request_membership()`);
      throw new Error("повторная заявка прошла");
    } catch (e) {
      if (!String(e).includes("NOTHING_TO_REQUEST")) throw e;
    }
  });

  it("лидер подтверждает заявку", async () => {
    const pending = await db.query(
      `select id from profiles where membership_status = 'pending' limit 1`,
    );
    await asUser(uid.leader);
    const r = await db.query(`select set_membership_status($1, 'member') s`, [
      pending.rows[0].id,
    ]);
    assert.equal(r.rows[0].s, "member", "статус");

    const p = await db.query(
      `select verification_method, verified_by from profiles where id = $1`,
      [pending.rows[0].id],
    );
    assert.equal(p.rows[0].verification_method, "manual", "способ");
    assert.equal(p.rows[0].verified_by, uid.leader, "кто подтвердил");
  });

  it("участник не подтверждает сам себя", async () => {
    await asUser(uid.c);
    try {
      await db.query(`select set_membership_status($1, 'member')`, [uid.c]);
    } catch (e) {
      if (!String(e).includes("FORBIDDEN")) throw e;
      return;
    }
    throw new Error("участник подтвердил себя сам");
  });
});

describe("что видно анониму", () => {
  const asAnon = async (fn) => {
    await db.exec(`set role anon`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  };

  it("имя лидера — видно, через public_leaders", async () => {
    const r = await asAnon(() => db.query(`select full_name from public_leaders`));
    const names = r.rows.map((row) => row.full_name);
    // Проверяем наличие, а не точное число: лидеров в клубе несколько,
    // и тест не должен ломаться от появления ещё одного.
    assert.ok(
      names.includes("Артём Лидер"),
      `лидера не видно, отдалось: ${names.join(", ")}`,
    );
    assert.ok(
      !names.includes("Алия Первая"),
      "в витрину лидеров попал обычный участник",
    );
  });

  it("счётчик мест опубликованного похода — видно", async () => {
    const r = await asAnon(() =>
      db.query(
        `select capacity, confirmed_count from hikes where slug = 'kok-zhailau-test'`,
      ),
    );
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].confirmed_count, 1);
  });

  it("телефоны из profiles — не видно", async () => {
    await db.exec(`set role anon`);
    try {
      const r = await db.query(`select phone from profiles`);
      assert.equal(r.rows.length, 0, "аноним прочитал телефоны");
    } catch (e) {
      assert.match(String(e), /permission denied/);
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("список участников — не видно", async () => {
    await db.exec(`set role anon`);
    try {
      await rejectsWith("permission denied", () =>
        db.query(`select * from public_members`),
      );
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("цифры клуба — видно, а таблицы за ними — нет", async () => {
    const r = await asAnon(() =>
      db.query(
        `select hikes_completed, members_count, total_elevation_m, routes_count
           from public_club_stats`,
      ),
    );
    assert.equal(r.rows.length, 1, "витрина цифр не отдалась анониму");
    // Числа, а не null: пустой клуб должен показывать нули, иначе на лендинге
    // окажется пустое место вместо цифры.
    for (const [key, value] of Object.entries(r.rows[0])) {
      assert.equal(typeof value, "number", `${key} пришло не числом: ${value}`);
    }
  });

  it("внутренние функции записи — не вызвать", async () => {
    // PostgREST публикует как RPC всё из схемы public. Эти функции —
    // SECURITY DEFINER без проверки прав: снаружи ими можно было бы
    // записать кого угодно куда угодно.
    await db.exec(`set role anon`);
    try {
      await rejectsWith("permission denied", () =>
        db.query(`select refresh_hike_counters('00000000-0000-0000-0000-000000000000')`),
      );
    } finally {
      await db.exec(`reset role`);
    }
  });
});

describe("лидеры не занимают мест участников", () => {
  let hike;
  let leaderA;
  let leaderB;

  async function makeLeader(email, name) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text))
       returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set role = 'leader', membership_status = 'member' where id = $1`,
      [id],
    );
    return id;
  }

  before(async () => {
    leaderA = await makeLeader("cap-a@narxoz.kz", "Лидер А");
    leaderB = await makeLeader("cap-b@narxoz.kz", "Лидер Б");

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('capacity-check', 'Проверка мест', 1, now() + interval '20 days', 2,
               'published', $1, true)
       returning id`,
      [leaderA],
    );
    hike = h.rows[0].id;
  });

  it("автор записан сам, но место при этом свободно", async () => {
    const reg = await db.query(
      `select as_leader, status from registrations where hike_id = $1 and user_id = $2`,
      [hike, leaderA],
    );
    assert.equal(reg.rows.length, 1, "автор не попал в ростер");
    assert.equal(reg.rows[0].as_leader, true);
    assert.equal(reg.rows[0].status, "confirmed");

    const h = await db.query(
      `select confirmed_count, leader_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(h.rows[0].confirmed_count, 0, "лидер съел место участника");
    assert.equal(h.rows[0].leader_count, 1);
  });

  it("второй лидер тоже идёт и тоже мест не занимает", async () => {
    await asUser(leaderA);
    await db.query(`select add_hike_leader($1, $2)`, [hike, leaderB]);

    const h = await db.query(
      `select confirmed_count, leader_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(h.rows[0].confirmed_count, 0);
    assert.equal(h.rows[0].leader_count, 2);
  });

  it("оба места достаются участникам, третий уходит в очередь", async () => {
    const people = [];
    for (const n of [1, 2, 3]) {
      const u = await db.query(
        `insert into auth.users (email, raw_user_meta_data)
         values ($1, jsonb_build_object('full_name', $2::text))
         returning id`,
        [`cap-p${n}@narxoz.kz`, `Участник ${n}`],
      );
      const id = u.rows[0].id;
      await db.query(
        `update profiles set membership_status = 'member', birth_date = '2004-01-01', fitness_level = 2,
                             phone = $2, consent_pd_at = now()
           where id = $1`,
        [id, `+7701000000${n}`],
      );
      await db.query(
        `insert into emergency_contacts (user_id, full_name, phone)
         values ($1, 'Родитель', '+77019999999')`,
        [id],
      );
      people.push(id);
    }

    const got = [];
    for (const id of people) {
      await asUser(id);
      const r = await db.query(`select * from register_for_hike($1)`, [hike]);
      got.push(r.rows[0].status);
    }

    assert.deepEqual(got, ["confirmed", "confirmed", "waitlist"]);

    const h = await db.query(
      `select confirmed_count, waitlist_count, leader_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(h.rows[0].confirmed_count, 2, "мест оказалось не два");
    assert.equal(h.rows[0].waitlist_count, 1);
    assert.equal(h.rows[0].leader_count, 2);
  });

  it("лидер не отменяет свою запись как участник", async () => {
    await asUser(leaderB);
    await rejectsWith("LEADER_REGISTRATION", () =>
      db.query(`select * from cancel_registration($1)`, [hike]),
    );
  });

  it("убрали из состава — ушёл и из ростера, очередь не тронута", async () => {
    await asUser(leaderA);
    await db.query(`select remove_hike_leader($1, $2)`, [hike, leaderB]);

    const reg = await db.query(
      `select status from registrations where hike_id = $1 and user_id = $2`,
      [hike, leaderB],
    );
    assert.equal(reg.rows[0].status, "cancelled");

    const h = await db.query(
      `select confirmed_count, waitlist_count, leader_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(h.rows[0].leader_count, 1);
    // Место лидера не было местом участника, поэтому очередь не двигается.
    assert.equal(h.rows[0].confirmed_count, 2, "очередь поехала на пустом месте");
    assert.equal(h.rows[0].waitlist_count, 1);
  });

  it("участника, ставшего лидером, переводит и освобождает его место", async () => {
    const promoted = await db.query(
      `select user_id from registrations
        where hike_id = $1 and status = 'confirmed' and not as_leader
        order by created_at limit 1`,
      [hike],
    );
    const target = promoted.rows[0].user_id;
    await db.query(`update profiles set role = 'leader' where id = $1`, [target]);

    await asUser(leaderA);
    await db.query(`select add_hike_leader($1, $2)`, [hike, target]);

    const reg = await db.query(
      `select as_leader, status from registrations where hike_id = $1 and user_id = $2`,
      [hike, target],
    );
    assert.equal(reg.rows[0].as_leader, true);
    assert.equal(reg.rows[0].status, "confirmed");

    // Освободившееся место должно уйти тому, кто стоял в очереди.
    const h = await db.query(
      `select confirmed_count, waitlist_count, leader_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(h.rows[0].confirmed_count, 2, "место не досталось очереди");
    assert.equal(h.rows[0].waitlist_count, 0);
    assert.equal(h.rows[0].leader_count, 2);
  });
});

describe("передача ответственности за поход", () => {
  let owner, heir, plain, hike;

  /** Заводит человека с нужной ролью: этому набору их нужно много. */
  async function mk(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    if (role) {
      await db.query(`update profiles set role = $2 where id = $1`, [id, role]);
    }
    return id;
  }

  it("угнать поход прямым запросом нельзя", async () => {
    // Это главное, ради чего миграция. hikes_leader_update разрешает UPDATE
    // любому из состава, а anon key лежит в клиентском бандле: до триггера
    // второй лидер мог переписать leader_id на себя мимо всякого интерфейса.
    owner = await mk("owner@narxoz.kz", "Хозяин Похода", "leader");
    heir = await mk("heir@narxoz.kz", "Преемник Лидеров", "leader");
    plain = await mk("plain@narxoz.kz", "Обычный Участник", null);

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('transfer-me', 'Кому-нибудь', 2, now() + interval '20 days',
               10, 'published', $1, true)
       returning id`,
      [owner],
    );
    hike = h.rows[0].id;

    await asUser(owner);
    await db.query(`select add_hike_leader($1, $2)`, [hike, heir]);

    await asUser(heir);
    await db.exec(`set role authenticated`);
    try {
      await rejectsWith("FORBIDDEN", () =>
        db.query(`update hikes set leader_id = $2 where id = $1`, [hike, heir]),
      );
    } finally {
      await db.exec(`reset role`);
    }

    const still = await db.query(`select leader_id from hikes where id = $1`, [
      hike,
    ]);
    assert.equal(still.rows[0].leader_id, owner, "поход угнали");
  });

  it("передать может только ответственный", async () => {
    await asUser(heir);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select transfer_hike_responsibility($1, $2)`, [hike, heir]),
    );
  });

  it("не лидеру ответственность не передать", async () => {
    await asUser(owner);
    await rejectsWith("NOT_A_LEADER", () =>
      db.query(`select transfer_hike_responsibility($1, $2)`, [hike, plain]),
    );
  });

  it("самому себе передавать нечего", async () => {
    await asUser(owner);
    await rejectsWith("ALREADY_RESPONSIBLE", () =>
      db.query(`select transfer_hike_responsibility($1, $2)`, [hike, owner]),
    );
  });

  it("передача меняет ответственного, прежний остаётся в составе", async () => {
    await asUser(owner);
    await db.query(`select transfer_hike_responsibility($1, $2)`, [hike, heir]);

    const h = await db.query(`select leader_id from hikes where id = $1`, [hike]);
    assert.equal(h.rows[0].leader_id, heir, "ответственный не сменился");

    const roster = await db.query(
      `select user_id from hike_leaders where hike_id = $1`,
      [hike],
    );
    assert.deepEqual(
      roster.rows.map((r) => r.user_id).sort(),
      [owner, heir].sort(),
      "прежний ответственный выпал из состава",
    );
  });

  it("права переехали вместе с ответственностью", async () => {
    // Один и тот же вызов, два разных кода ошибки. Прежний ответственный
    // отбивается по правам, новый — доходит до проверки самого кандидата.
    await asUser(owner);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select add_hike_leader($1, $2)`, [hike, plain]),
    );

    await asUser(heir);
    await rejectsWith("NOT_A_LEADER", () =>
      db.query(`select add_hike_leader($1, $2)`, [hike, plain]),
    );
  });

  it("получателя, которого не было в составе, добавляет сама", async () => {
    const far = await mk("far@narxoz.kz", "Дальний Лидер", "leader");
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('transfer-cold', 'Холодная передача', 1,
               now() + interval '21 days', 10, 'published', $1, true)
       returning id`,
      [owner],
    );
    const cold = h.rows[0].id;

    await asUser(owner);
    await db.query(`select transfer_hike_responsibility($1, $2)`, [cold, far]);

    const inRoster = await db.query(
      `select count(*)::int c from hike_leaders where hike_id = $1 and user_id = $2`,
      [cold, far],
    );
    assert.equal(inRoster.rows[0].c, 1, "новый ответственный не попал в состав");

    // Отвечать за поход, не имея доступа к контактам своей группы, бессмысленно.
    const reg = await db.query(
      `select as_leader, status from registrations where hike_id = $1 and user_id = $2`,
      [cold, far],
    );
    assert.equal(reg.rows[0].as_leader, true, "запись не отмечена лидерской");
    assert.equal(reg.rows[0].status, "confirmed");
  });

  it("отдав ответственность, можно уйти с похода самому", async () => {
    // Иначе тупик «создал и не могу пойти» закрыт наполовину: пришлось бы
    // просить нового ответственного «убери меня».
    const solo = await mk("solo@narxoz.kz", "Ушедший Лидер", "leader");
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('transfer-and-leave', 'Отдал и ушёл', 1,
               now() + interval '22 days', 10, 'published', $1, true)
       returning id`,
      [solo],
    );
    const mine = h.rows[0].id;

    await asUser(solo);
    await db.query(`select transfer_hike_responsibility($1, $2)`, [mine, heir]);
    // Теперь он обычный лидер, и is_hike_responsible про него уже неправда.
    await db.query(`select remove_hike_leader($1, $2)`, [mine, solo]);

    const left = await db.query(
      `select count(*)::int c from hike_leaders where hike_id = $1 and user_id = $2`,
      [mine, solo],
    );
    assert.equal(left.rows[0].c, 0, "не смог уйти с похода после передачи");
  });

  it("посторонний чужого из состава всё равно не уберёт", async () => {
    await asUser(plain);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select remove_hike_leader($1, $2)`, [hike, heir]),
    );
  });

  it("админ передаёт чужой поход", async () => {
    // Ради того случая, ради которого всё и затевалось: ответственный ушёл
    // из клуба и передать уже не может.
    const boss = await mk("boss@narxoz.kz", "Админ Клуба", "admin");
    await asUser(boss);
    await db.query(`select transfer_hike_responsibility($1, $2)`, [hike, owner]);

    const h = await db.query(`select leader_id from hikes where id = $1`, [hike]);
    assert.equal(h.rows[0].leader_id, owner, "админ не смог передать");
  });
});

describe("закрытая запись на походы", () => {
  let boss, culprit, lead, hike;

  // Чего этот набор не проверяет: отказ по session_user внутри
  // ban_member/unban_member. В PGlite session_user всегда postgres, а
  // понижение через `set session authorization` необратимо — роль обратно не
  // поднимается даже откатом транзакции, и дальнейшие тесты шли бы от чужого
  // имени. Поэтому снаружи проверяется то, что и должно защищать в первую
  // очередь: прав на вызов у клиента нет вообще.

  async function mkUser(email, name, role, phone) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    if (role) {
      await db.query(`update profiles set role = $2 where id = $1`, [id, role]);
    }
    // Профиль сразу заполненный: иначе register_for_hike отобьётся по
    // PROFILE_INCOMPLETE и до проверки бана дело не дойдёт.
    await db.query(
      `update profiles
          set phone = $2, birth_date = '2005-05-05', consent_pd_at = now(), fitness_level = 2,
              membership_status = 'member'
        where id = $1`,
      [id, phone],
    );
    await db.query(
      `insert into emergency_contacts (user_id, full_name, phone, is_parent)
       values ($1, 'Родитель', '+77019990000', true)`,
      [id],
    );
    return id;
  }

  it("бан снимает человека с будущих походов", async () => {
    // Иначе бан бесполезен там, где он нужнее всего: банят после
    // происшествия, а человек уже записан на ближайшие выходные.
    boss = await mkUser("banboss@narxoz.kz", "Админ Банов", "admin", "+77012220001");
    lead = await mkUser("banlead@narxoz.kz", "Лидер Банов", "leader", "+77012220002");
    culprit = await mkUser("culprit@narxoz.kz", "Виноватый Участник", null, "+77012220003");

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('ban-hike', 'Поход с баном', 1, now() + interval '30 days',
               10, 'published', $1, true)
       returning id`,
      [lead],
    );
    hike = h.rows[0].id;

    await asUser(culprit);
    await db.query(`select * from register_for_hike($1)`, [hike]);

    await asUser(boss);
    const r = await db.query(`select ban_member($1, $2) as cancelled`, [
      culprit,
      "разошёлся с группой на маршруте",
    ]);
    assert.equal(r.rows[0].cancelled, 1, "будущая запись не снята");

    const reg = await db.query(
      `select status from registrations where hike_id = $1 and user_id = $2`,
      [hike, culprit],
    );
    assert.equal(reg.rows[0].status, "cancelled");
  });

  it("забаненный не записывается сам", async () => {
    await asUser(culprit);
    await rejectsWith("BANNED", () =>
      db.query(`select * from register_for_hike($1)`, [hike]),
    );
  });

  it("и лидер не запишет его руками", async () => {
    // Ручная запись — клапан для исключений, но не для обхода решения админа.
    await asUser(lead);
    await rejectsWith("BANNED", () =>
      db.query(`select * from register_participant($1, $2)`, [hike, culprit]),
    );
  });

  it("снять бан себе нельзя", async () => {
    // anon key лежит в клиентском бандле, а свою строку профиля править можно.
    await asUser(culprit);
    await db.exec(`set role authenticated`);
    try {
      await rejectsWith("FORBIDDEN_BAN_CHANGE", () =>
        db.query(`update profiles set banned_at = null where id = $1`, [culprit]),
      );
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("из клиента бан не выдать и не снять", async () => {
    // PostgREST публикует как RPC всё из схемы public. Выдача задумана из
    // базы, поэтому этой двери просто нет — иначе единственным заслоном
    // между забаненным и его разбаном была бы проверка внутри функции.
    await db.exec(`set role authenticated`);
    try {
      await rejectsWith("permission denied", () =>
        db.query(`select unban_member($1)`, [culprit]),
      );
      await rejectsWith("permission denied", () =>
        db.query(`select ban_member($1, null)`, [culprit]),
      );
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("админ снимает бан, и запись снова открыта", async () => {
    await asUser(boss);
    await db.query(`select unban_member($1)`, [culprit]);

    await asUser(culprit);
    const r = await db.query(`select * from register_for_hike($1)`, [hike]);
    assert.equal(r.rows[0].status, "confirmed", "запись не открылась обратно");
  });

  it("членство бан не затирает", async () => {
    // Ради этого он и живёт отдельной колонкой: после прощения человек
    // возвращается тем же, кем был.
    const p = await db.query(
      `select membership_status, banned_at from profiles where id = $1`,
      [culprit],
    );
    assert.equal(p.rows[0].membership_status, "member");
    assert.equal(p.rows[0].banned_at, null);
  });

  it("выдаётся из SQL-редактора, где входа нет", async () => {
    // Единственный предусмотренный способ выдачи, и он отвечал FORBIDDEN:
    // в редакторе Supabase JWT нет, auth.uid() пуст, is_admin() ложно.
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);

    const r = await db.query(`select ban_member($1, $2) as cancelled`, [
      culprit,
      "проверка из редактора",
    ]);
    assert.equal(r.rows[0].cancelled, 1, "запись после разбана не снялась");

    const p = await db.query(`select banned_at from profiles where id = $1`, [
      culprit,
    ]);
    assert.notEqual(p.rows[0].banned_at, null, "отметка не поставилась");

    await db.query(`select unban_member($1)`, [culprit]);
    const after = await db.query(
      `select banned_at from profiles where id = $1`,
      [culprit],
    );
    assert.equal(after.rows[0].banned_at, null, "разбан из редактора не сработал");
  });
});

describe("точка маршрута для прогноза", () => {
  let lead;

  /** Поход с произвольным набором полей точки. Возвращает промис вставки. */
  function mkHike(slug, fields) {
    const keys = Object.keys(fields);
    const params = keys.map((_, i) => `$${i + 2}`).join(", ");
    return db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id${keys.length ? ", " + keys.join(", ") : ""})
       values ($1, 'Поход с погодой', 2, now() + interval '10 days', 12,
               'published', $${keys.length + 2}${keys.length ? ", " + params : ""})`,
      [slug, ...keys.map((k) => fields[k]), lead],
    );
  }

  before(async () => {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('weatherlead@narxoz.kz',
               jsonb_build_object('full_name', 'Лидер Погодный')) returning id`,
    );
    lead = u.rows[0].id;
    await db.query(`update profiles set role = 'leader' where id = $1`, [lead]);
  });

  it("поход без точки остаётся законным", async () => {
    // Координаты необязательны: у большинства старых походов их нет и не
    // будет, и блок погоды просто не рисуется.
    await mkHike("weather-none", {});
    const r = await db.query(
      `select route_lat, route_altitude_m from hikes where slug = 'weather-none'`,
    );
    assert.equal(r.rows[0].route_lat, null);
    assert.equal(r.rows[0].route_altitude_m, null);
  });

  it("принимает полную точку", async () => {
    await mkHike("weather-full", {
      route_lat: 43.11667,
      route_lon: 76.98333,
      route_altitude_m: 2800,
    });
    const r = await db.query(
      `select route_lat, route_lon, route_altitude_m
         from hikes where slug = 'weather-full'`,
    );
    assert.equal(Number(r.rows[0].route_lat), 43.11667);
    assert.equal(Number(r.rows[0].route_lon), 76.98333);
    assert.equal(r.rows[0].route_altitude_m, 2800);
  });

  it("не пускает половину координат", async () => {
    // Широта Алматы с пустой долготой — это не «заполнено наполовину», а
    // точка в Атлантике: прогноз придёт, просто чужой.
    await rejectsWith("hikes_route_point_complete", () =>
      mkHike("weather-half", { route_lat: 43.11667, route_altitude_m: 2800 }),
    );
    await rejectsWith("hikes_route_point_complete", () =>
      mkHike("weather-half-2", { route_lon: 76.98333, route_altitude_m: 2800 }),
    );
  });

  it("не пускает точку без высоты", async () => {
    // Без высоты подписать блок нечем, а подпись здесь обязательна.
    await rejectsWith("hikes_route_altitude_with_point", () =>
      mkHike("weather-noalt", { route_lat: 43.11667, route_lon: 76.98333 }),
    );
  });

  it("отбивает лишний ноль в высоте", async () => {
    // Поле заполняется руками: «28000» вместо «2800» должно падать в базе,
    // а не уезжать в запрос прогноза.
    await rejectsWith("hikes_route_altitude_range", () =>
      mkHike("weather-bigalt", {
        route_lat: 43.11667,
        route_lon: 76.98333,
        route_altitude_m: 28000,
      }),
    );
  });

  it("отбивает координаты вне диапазона", async () => {
    await rejectsWith("hikes_route_lat_range", () =>
      mkHike("weather-badlat", {
        route_lat: 143.5,
        route_lon: 76.98333,
        route_altitude_m: 2800,
      }),
    );
    await rejectsWith("hikes_route_lon_range", () =>
      mkHike("weather-badlon", {
        route_lat: 43.11667,
        route_lon: 276.5,
        route_altitude_m: 2800,
      }),
    );
  });
});

describe("фотографии похода", () => {
  let lead, stranger, hike, draft;

  async function mkUser(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    if (role) {
      await db.query(`update profiles set role = $2 where id = $1`, [id, role]);
    }
    return id;
  }

  /** Выполняет запрос от имени клиентской роли — только так работает RLS. */
  async function asClient(fn) {
    await db.exec(`set role authenticated`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  }

  before(async () => {
    lead = await mkUser("photolead@narxoz.kz", "Лидер Фотографов", "leader");
    stranger = await mkUser("photostranger@narxoz.kz", "Посторонний Зритель", null);

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('photo-hike', 'Поход с фото', 2, now() - interval '10 days',
               10, 'completed', $1, true)
       returning id`,
      [lead],
    );
    hike = h.rows[0].id;

    const d = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('photo-draft', 'Черновик с фото', 2, now() + interval '10 days',
               10, 'draft', $1, true)
       returning id`,
      [lead],
    );
    draft = d.rows[0].id;
  });

  it("лидер добавляет снимки своему походу", async () => {
    await asUser(lead);
    await asClient(() =>
      db.query(
        `insert into hike_photos (hike_id, path, thumb_path, sort_order, uploaded_by)
         values ($1, 'hike-photos/a.jpg', 'hike-photos/a-thumb.jpg', 0, $2)`,
        [hike, lead],
      ),
    );
    const r = await db.query(
      `select count(*)::int c from hike_photos where hike_id = $1`,
      [hike],
    );
    assert.equal(r.rows[0].c, 1);
  });

  it("посторонний не добавит снимок чужому походу", async () => {
    // Кнопки у него нет, но политика — единственное, что защищает от
    // прямого запроса мимо интерфейса.
    await asUser(stranger);
    await asClient(() =>
      rejectsWith("row-level security", () =>
        db.query(
          `insert into hike_photos (hike_id, path, thumb_path, uploaded_by)
           values ($1, 'hike-photos/hack.jpg', 'hike-photos/hack-thumb.jpg', $2)`,
          [hike, stranger],
        ),
      ),
    );
  });

  it("посторонний не удалит чужой снимок", async () => {
    await asUser(stranger);
    const deleted = await asClient(() =>
      db.query(`delete from hike_photos where hike_id = $1`, [hike]),
    );
    assert.equal(deleted.affectedRows ?? 0, 0, "снимок удалился посторонним");
  });

  it("снимки состоявшегося похода видны всем", async () => {
    await asUser(stranger);
    const r = await asClient(() =>
      db.query(`select count(*)::int c from hike_photos where hike_id = $1`, [hike]),
    );
    assert.equal(r.rows[0].c, 1);
  });

  it("снимки черновика посторонним не видны", async () => {
    // Иначе поход, который лидер ещё не опубликовал, светится фотографиями.
    await asUser(lead);
    await asClient(() =>
      db.query(
        `insert into hike_photos (hike_id, path, thumb_path, uploaded_by)
         values ($1, 'hike-photos/d.jpg', 'hike-photos/d-thumb.jpg', $2)`,
        [draft, lead],
      ),
    );

    await asUser(stranger);
    const r = await asClient(() =>
      db.query(`select count(*)::int c from hike_photos where hike_id = $1`, [draft]),
    );
    assert.equal(r.rows[0].c, 0, "черновик светится фотографиями");
  });

  it("удаление похода уносит снимки за собой", async () => {
    await db.query(`delete from hikes where id = $1`, [hike]);
    const r = await db.query(
      `select count(*)::int c from hike_photos where hike_id = $1`,
      [hike],
    );
    assert.equal(r.rows[0].c, 0, "остались осиротевшие снимки");
  });

  it("бакеты заведены, и снимки с аватарами открыты на чтение", async () => {
    // Закрытым остаётся только бакет бланков расписки. Не потому, что в
    // бланке что-то личное — он пустой, — а потому, что адрес файла из
    // открытого бакета пересылается в чат и работает вечно. Проверяем состав
    // целиком: чтобы новый бакет не появился публичным по недосмотру.
    const r = await db.query(
      `select id, public from storage.buckets order by id`,
    );
    assert.deepEqual(
      r.rows.map((b) => `${b.id}:${b.public}`),
      ["avatars:true", "hike-photos:true", "waiver-forms:false", "waivers:false"],
    );
  });
});

describe("снимок на главную", () => {
  let lead, stranger, hike, photo;

  before(async () => {
    const mk = async (email, name, role) => {
      const u = await db.query(
        `insert into auth.users (email, raw_user_meta_data)
         values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
        [email, name],
      );
      const id = u.rows[0].id;
      if (role) {
        await db.query(`update profiles set role = $2 where id = $1`, [id, role]);
      }
      return id;
    };

    lead = await mk("featlead@narxoz.kz", "Лидер Обложек", "leader");
    stranger = await mk("featstranger@narxoz.kz", "Чужой Зритель", null);

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('featured-hike', 'Поход для главной', 2, now() - interval '5 days',
               10, 'completed', $1, true)
       returning id`,
      [lead],
    );
    hike = h.rows[0].id;

    const p = await db.query(
      `insert into hike_photos (hike_id, path, thumb_path, uploaded_by)
       values ($1, 'x/a.jpg', 'x/a-thumb.jpg', $2) returning id`,
      [hike, lead],
    );
    photo = p.rows[0].id;
  });

  it("по умолчанию снимок не на главной", async () => {
    // Иначе первая же загрузка молча заняла бы герой лендинга.
    const r = await db.query(`select featured from hike_photos where id = $1`, [
      photo,
    ]);
    assert.equal(r.rows[0].featured, false);
  });

  it("лидер отмечает свой снимок", async () => {
    await asUser(lead);
    await db.exec(`set role authenticated`);
    try {
      await db.query(`update hike_photos set featured = true where id = $1`, [
        photo,
      ]);
    } finally {
      await db.exec(`reset role`);
    }
    const r = await db.query(`select featured from hike_photos where id = $1`, [
      photo,
    ]);
    assert.equal(r.rows[0].featured, true);
  });

  it("посторонний не отметит чужой снимок", async () => {
    // Герой лендинга — самое видное место на сайте, и попасть туда мимо
    // лидера нельзя.
    await asUser(stranger);
    await db.exec(`set role authenticated`);
    try {
      const r = await db.query(
        `update hike_photos set featured = false where id = $1`,
        [photo],
      );
      assert.equal(r.affectedRows, 0, "посторонний снял отметку");
    } finally {
      await db.exec(`reset role`);
    }
  });
});

describe("место сбора только для тех, кто идёт", () => {
  let lead, going, waiting, stranger, hike;

  /** Человек с заполненным профилем: иначе register_for_hike отобьётся раньше. */
  async function mkUser(email, name, role, phone) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    if (role) {
      await db.query(`update profiles set role = $2 where id = $1`, [id, role]);
    }
    await db.query(
      `update profiles
          set phone = $2, birth_date = '2005-03-03', consent_pd_at = now(), fitness_level = 2,
              membership_status = 'member'
        where id = $1`,
      [id, phone],
    );
    await db.query(
      `insert into emergency_contacts (user_id, full_name, phone, is_parent)
       values ($1, 'Родитель', '+77018880000', true)`,
      [id],
    );
    return id;
  }

  /** Запрос от имени клиентской роли: только так работают права на колонки. */
  async function asClient(fn) {
    await db.exec(`set role authenticated`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  }

  const point = (id) =>
    asClient(async () => {
      await asUser(id);
      const r = await db.query(`select * from hike_meeting_point($1)`, [hike]);
      return r.rows[0];
    });

  before(async () => {
    lead = await mkUser("mplead@narxoz.kz", "Лидер Сбора", "leader", "+77013330001");
    going = await mkUser("mpgoing@narxoz.kz", "Идущий Участник", null, "+77013330002");
    waiting = await mkUser("mpwait@narxoz.kz", "Ждущий Очереди", null, "+77013330003");
    stranger = await mkUser("mpstranger@narxoz.kz", "Просто Зритель", null, "+77013330004");

    // Одно место: второй записавшийся гарантированно уходит в очередь.
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers, meeting_point,
                          meeting_point_url)
       values ('meeting-point-hike', 'Поход с точкой сбора', 2,
               now() + interval '14 days', 1, 'published', $1, true,
               'у Атакента', 'https://2gis.kz/almaty/geo/1')
       returning id`,
      [lead],
    );
    hike = h.rows[0].id;

    await asUser(going);
    await db.query(`select * from register_for_hike($1)`, [hike]);
    await asUser(waiting);
    await db.query(`select * from register_for_hike($1)`, [hike]);
  });

  it("прямым запросом колонку не прочитать — ни анониму, ни вошедшему", async () => {
    // Главное, ради чего миграция: anon key лежит в клиентском бандле, и
    // условие в вёрстке спрятало бы блок, оставив адрес в ответе PostgREST.
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await rejectsWith("permission denied", () =>
          db.query(`select meeting_point from hikes where id = $1`, [hike]),
        );
      } finally {
        await db.exec(`reset role`);
      }
    }
  });

  it("остальные колонки похода читаются по-прежнему", async () => {
    // Скрыты должны быть ровно две. Этот тест ловит и обратное: новую
    // колонку, которой в будущей миграции забыли выдать select.
    const r = await db.query(`
      select c.column_name
        from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'hikes'
          and not exists (
            select 1 from information_schema.column_privileges p
             where p.table_schema = 'public' and p.table_name = 'hikes'
               and p.column_name = c.column_name
               and p.grantee = 'anon' and p.privilege_type = 'SELECT'
          )
        order by c.column_name
    `);
    assert.deepEqual(
      r.rows.map((x) => x.column_name),
      ["meeting_point", "meeting_point_url"],
      "состав скрытых колонок разошёлся с задуманным",
    );
  });

  it("записанный участник видит адрес и ссылку на карту", async () => {
    const r = await point(going);
    assert.equal(r.visible, true);
    assert.equal(r.meeting_point, "у Атакента");
    assert.equal(r.meeting_point_url, "https://2gis.kz/almaty/geo/1");
  });

  it("лидер видит, даже не будучи участником по местам", async () => {
    const r = await point(lead);
    assert.equal(r.visible, true);
    assert.equal(r.meeting_point, "у Атакента");
  });

  it("лист ожидания не видит", async () => {
    // Ради этого всё и делалось: место в группе ещё не досталось, а прийти
    // по адресу человек может так же, как записанный.
    const r = await point(waiting);
    assert.equal(r.visible, false);
    assert.equal(r.meeting_point, null);
    assert.equal(r.meeting_point_url, null);
  });

  it("посторонний не видит", async () => {
    const r = await point(stranger);
    assert.equal(r.visible, false);
    assert.equal(r.meeting_point, null);
  });

  it("подъём из очереди открывает адрес сам, без отдельного действия", async () => {
    await asUser(going);
    await db.query(`select * from cancel_registration($1)`, [hike]);

    const r = await point(waiting);
    assert.equal(r.visible, true, "поднятый из очереди остался без адреса");
    assert.equal(r.meeting_point, "у Атакента");
  });

  it("отменивший запись адрес теряет", async () => {
    const r = await point(going);
    assert.equal(r.visible, false);
  });
});

describe("справочник снаряжения", () => {
  it("кошек в списке нет, пока нет ледоруба", async () => {
    // Это инвариант, а не снимок содержимого. Ледоступы — микрошипы против
    // скользкой тропы. Настоящие кошки нужны там, где есть куда падать, и в
    // такой рельеф не выходят без ледоруба и умения зарубаться. Предлагать
    // одно без другого — обещать новичку рельеф, для которого не дано
    // главного. Разбор в миграции 20260830120000.
    const r = await db.query(
      `select
         count(*) filter (where name ilike '%кошк%')::int as spikes,
         count(*) filter (where name ilike '%ледоруб%')::int as axe
       from gear_items`,
    );
    const { spikes, axe } = r.rows[0];
    assert.ok(
      spikes === 0 || axe > 0,
      "в списке появились кошки, а ледоруба нет",
    );
  });

  it("еда и защита от солнца нужны с первого похода", async () => {
    // Голод и ультрафиолет не зависят от сложности маршрута — в отличие от
    // всего остального в этом списке. Ставились сюда осознанно, и поднять их
    // «повыше» значит отменить решение, а не поправить мелочь.
    //
    // Про еду спрашиваем текстом, а не по slug: она живёт в одной строке с
    // водой (список первой категории — то место, где новичок решает, по силам
    // ли ему клуб, и лишняя строка там работает против). Собственный пункт
    // ей не нужен, а вот исчезнуть из первой категории она не должна.
    const r = await db.query(
      `select
         count(*) filter (
           where min_hike_category = 1 and name ilike '%перекус%'
         )::int as food,
         count(*) filter (
           where min_hike_category = 1 and slug = 'sunhat'
         )::int as sun
       from gear_items`,
    );
    assert.ok(r.rows[0].food > 0, "перекус пропал из первой категории");
    assert.equal(r.rows[0].sun, 1, "защита от солнца уехала из первой категории");
  });
});

describe("бланки расписки у клуба", () => {
  let lead, member, outsider;

  /** Выполняет запрос от имени клиентской роли — только так работает RLS. */
  async function asClient(fn) {
    await db.exec(`set role authenticated`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role`);
    }
  }

  before(async () => {
    const mk = async (email, name, role) => {
      const u = await db.query(
        `insert into auth.users (email, raw_user_meta_data)
         values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
        [email, name],
      );
      const id = u.rows[0].id;
      if (role) {
        await db.query(`update profiles set role = $2 where id = $1`, [id, role]);
      }
      return id;
    };
    lead = await mk("formlead@narxoz.kz", "Лидер Бланков", "leader");
    member = await mk("formmember@narxoz.kz", "Участник Обычный", null);
    outsider = await mk("formout@narxoz.kz", "Посторонний Совсем", null);
  });

  it("прежних колонок у похода больше нет", async () => {
    // Два источника одного факта — это будущий вопрос «а откуда здесь бланк».
    const r = await db.query(
      `select count(*)::int c from information_schema.columns
        where table_name = 'hikes' and column_name like 'waiver%'`,
    );
    assert.equal(r.rows[0].c, 0);
  });

  it("у прежнего бакета не осталось политик", async () => {
    // Сам бакет остаётся: delete from storage.buckets Supabase запрещает
    // триггером, и убрать его можно только руками через панель. Пустой и без
    // политик он недоступен никому — проверяем именно это, а не отсутствие
    // строки, которого нам не добиться.
    const r = await db.query(
      `select count(*)::int c from pg_policies
        where schemaname = 'storage' and policyname like 'waivers_%'`,
    );
    assert.equal(r.rows[0].c, 0);
  });

  it("бакет закрытый, как и прежний", async () => {
    // Открытый отдал бы бланк всякому, кто знает адрес, а адрес — первое,
    // что пересылают в чат.
    const r = await db.query(
      `select public from storage.buckets where id = 'waiver-forms'`,
    );
    assert.equal(r.rows[0].public, false);
  });

  it("двух взрослых бланков у клуба быть не может", async () => {
    await asUser(lead);
    await asClient(() =>
      db.query(
        `insert into waiver_forms (kind, path, uploaded_by)
         values ('adult', 'adult-1.pdf', $1)`,
        [lead],
      ),
    );
    await rejectsWith("duplicate key", () =>
      db.query(
        `insert into waiver_forms (kind, path) values ('adult', 'adult-2.pdf')`,
      ),
    );
  });

  it("вид бланка бывает только взрослый или детский", async () => {
    await rejectsWith("waiver_forms_kind_check", () =>
      db.query(`insert into waiver_forms (kind, path) values ('senior', 'x.pdf')`),
    );
  });

  it("путь виден анониму: плашка стоит на странице до записи", async () => {
    // Ей надо отличать «бланк есть» от «бланк ещё не загружен», а видит её и
    // тот, кто ещё не записался и даже не вошёл.
    await db.exec(`set role anon`);
    try {
      const r = await db.query(`select path from waiver_forms where kind = 'adult'`);
      assert.equal(r.rows[0].path, "adult-1.pdf");
    } finally {
      await db.exec(`reset role`);
    }
  });

  it("обычный участник бланк не подменит", async () => {
    await asUser(member);
    const changed = await asClient(() =>
      db.query(`update waiver_forms set path = 'hack.pdf' where kind = 'adult'`),
    );
    // Политика запрещает запись не ошибкой, а нулём изменённых строк.
    assert.equal(changed.affectedRows ?? 0, 0);
  });

  it("и не удалит", async () => {
    await asUser(member);
    const deleted = await asClient(() =>
      db.query(`delete from waiver_forms where kind = 'adult'`),
    );
    assert.equal(deleted.affectedRows ?? 0, 0);
  });

  it("любой лидер меняет бланк, не только админ", async () => {
    // Бланк меняют раз в год, и упирать это в одного человека значит однажды
    // ждать его из отпуска.
    await asUser(lead);
    const changed = await asClient(() =>
      db.query(`update waiver_forms set path = 'adult-2.pdf' where kind = 'adult'`),
    );
    assert.equal(changed.affectedRows, 1);
  });

  it("файл виден любому вошедшему, а не только идущему в поход", async () => {
    // У клубного бланка похода нет, привязать его к «идёт хоть куда-нибудь»
    // значило бы писать в политике то, чего она не знает. Бланк — пустая
    // форма, вход в клуб для неё достаточная граница.
    await db.query(
      `insert into storage.objects (bucket_id, name)
       values ('waiver-forms', 'adult-2.pdf')`,
    );
    await asUser(outsider);
    const seen = await asClient(() =>
      db.query(
        `select count(*)::int c from storage.objects where bucket_id = 'waiver-forms'`,
      ),
    );
    assert.equal(seen.rows[0].c, 1);
  });

  it("но подложить файл может только лидер", async () => {
    await asUser(member);
    await asClient(() =>
      rejectsWith("row-level security", () =>
        db.query(
          `insert into storage.objects (bucket_id, name)
           values ('waiver-forms', 'adult-hack.pdf')`,
        ),
      ),
    );
  });

  it("и удалить тоже только лидер", async () => {
    await asUser(member);
    const deleted = await asClient(() =>
      db.query(`delete from storage.objects where bucket_id = 'waiver-forms'`),
    );
    assert.equal(deleted.affectedRows ?? 0, 0);
  });
});

describe("где человек уже был", () => {
  let lead, member, stranger, hike;

  before(async () => {
    const mk = async (email, name, role) => {
      const u = await db.query(
        `insert into auth.users (email, raw_user_meta_data)
         values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
        [email, name],
      );
      const id = u.rows[0].id;
      if (role) {
        await db.query(`update profiles set role = $2 where id = $1`, [id, role]);
      }
      await db.query(
        `update profiles set membership_status = 'member' where id = $1`,
        [id],
      );
      return id;
    };

    lead = await mk("placeslead@narxoz.kz", "Лидер Опытный", "leader");
    member = await mk("placesmember@narxoz.kz", "Участник Бывалый", null);
    stranger = await mk("placesstranger@narxoz.kz", "Чужой Любопытный", null);

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('visited-places', 'Поход с опытными', 2,
               now() + interval '15 days', 10, 'published', $1, true)
       returning id`,
      [lead],
    );
    hike = h.rows[0].id;

    await asUser(member);
    await db.exec(`set role authenticated`);
    await db.query(
      `update profiles set visited_places = $2 where id = $1`,
      [member, "Фурманова со школой, Букреева в прошлом году"],
    );
    await db.exec(`reset role`);

    // Записывает лидер: доступ к профилю даёт именно запись на его поход.
    await asUser(lead);
    await db.query(`select register_participant($1, $2)`, [hike, member]);
  });

  it("человек пишет о себе сам", async () => {
    const r = await db.query(`select visited_places from profiles where id = $1`, [
      member,
    ]);
    assert.match(r.rows[0].visited_places, /Букреева/);
  });

  it("не принимает простыню вместо абзаца", async () => {
    // Поле читают с телефона в списке на двадцать человек: абзац прочтут,
    // страницу пролистают.
    await rejectsWith("profiles_visited_places_length", () =>
      db.query(`update profiles set visited_places = $2 where id = $1`, [
        member,
        "х".repeat(1001),
      ]),
    );
  });

  it("лидер своего похода читает, посторонний — нет", async () => {
    // Отдельной политики не заводили: profiles_select уже описывает ровно
    // этот круг — сам человек, лидер его похода, админ.
    await asUser(lead);
    await db.exec(`set role authenticated`);
    const seen = await db.query(
      `select visited_places from profiles where id = $1`,
      [member],
    );
    await db.exec(`reset role`);
    assert.equal(seen.rows.length, 1, "лидер не видит профиль своей группы");

    await asUser(stranger);
    await db.exec(`set role authenticated`);
    const hidden = await db.query(
      `select visited_places from profiles where id = $1`,
      [member],
    );
    await db.exec(`reset role`);
    assert.equal(hidden.rows.length, 0, "посторонний читает чужой профиль");
  });
});

describe("команда клуба", () => {
  let member;

  before(async () => {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('teamlead@narxoz.kz',
               jsonb_build_object('full_name', 'Лидер Командный')) returning id`,
    );
    member = u.rows[0].id;
    await db.query(`update profiles set role = 'leader' where id = $1`, [member]);
  });

  it("подпись роли и порядок по умолчанию пусты", async () => {
    // Лендинг показывает только вписанных руками, а не всех подряд.
    const r = await db.query(
      `select club_title, team_order, instagram from profiles where id = $1`,
      [member],
    );
    assert.equal(r.rows[0].club_title, null);
    assert.equal(r.rows[0].team_order, null);
    assert.equal(r.rows[0].instagram, null);
  });

  it("подпись роли не влияет на права", async () => {
    // «SMM» — надпись под фотографией, а не роль в системе: человек с ней
    // остаётся лидером и ведёт походы наравне со всеми.
    await db.query(
      `update profiles set club_title = 'SMM', team_order = 3 where id = $1`,
      [member],
    );
    const r = await db.query(`select role from profiles where id = $1`, [member]);
    assert.equal(r.rows[0].role, "leader");
  });

  it("принимает ник инстаграма", async () => {
    await db.query(`update profiles set instagram = 'step.up_kz' where id = $1`, [
      member,
    ]);
    const r = await db.query(`select instagram from profiles where id = $1`, [
      member,
    ]);
    assert.equal(r.rows[0].instagram, "step.up_kz");
  });

  it("не принимает ссылку вместо ника", async () => {
    // Поле заполняется руками, и «instagram.com/username» вместо ника дало
    // бы битую ссылку на самом видном месте лендинга.
    await rejectsWith("profiles_instagram_handle", () =>
      db.query(`update profiles set instagram = $2 where id = $1`, [
        member,
        "https://instagram.com/step.up_kz",
      ]),
    );
    await rejectsWith("profiles_instagram_handle", () =>
      db.query(`update profiles set instagram = $2 where id = $1`, [member, "@ник"]),
    );
  });

  it("витрина отдаёт новые колонки", async () => {
    const r = await db.query(
      `select club_title, team_order, instagram from public_leaders where id = $1`,
      [member],
    );
    assert.equal(r.rows[0].club_title, "SMM");
    assert.equal(r.rows[0].team_order, 3);
  });

  it("витрина по-прежнему не отдаёт телефон", async () => {
    // Состав колонок здесь — граница публичности, и расширение под команду
    // не должно было её сдвинуть.
    const r = await db.query(`
      select column_name from information_schema.columns
       where table_name = 'public_leaders'
    `);
    const columns = r.rows.map((x) => x.column_name);
    for (const secret of ["phone", "birth_date", "banned_at", "consent_pd_at"]) {
      assert.equal(columns.includes(secret), false, `витрина светит ${secret}`);
    }
  });
});

describe("сборка чата похода", () => {
  let leader, stranger, first, second, hike;

  async function mk(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member', role = coalesce($2, role)
        where id = $1`,
      [id, role],
    );
    return id;
  }

  before(async () => {
    leader = await mk("chat-lead@narxoz.kz", "Лидер Чата", "leader");
    stranger = await mk("chat-alien@narxoz.kz", "Чужой Лидер", "leader");
    first = await mk("chat-one@narxoz.kz", "Первый Участник", null);
    second = await mk("chat-two@narxoz.kz", "Второй Участник", null);

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('chat-hike', 'Поход с чатом', 1, now() + interval '10 days', 1,
               'published', $1, true)
       returning id`,
      [leader],
    );
    hike = h.rows[0].id;

    // Одно место: первый идёт, второй встаёт в очередь.
    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [hike, first]);
    await db.query(`select register_participant($1, $2)`, [hike, second]);
  });

  it("лидер отмечает добавленного в чат", async () => {
    await asUser(leader);
    await db.query(`select set_chat_status($1, $2, 'added')`, [hike, first]);

    const r = await db.query(
      `select chat_status, chat_status_at from registrations
        where hike_id = $1 and user_id = $2`,
      [hike, first],
    );
    assert.equal(r.rows[0].chat_status, "added");
    assert.notEqual(r.rows[0].chat_status_at, null);
  });

  it("вторая кнопка перебивает первую", async () => {
    // Упёрся в запрет на добавление в группы, отправил ссылку — отметка
    // должна стать той, что описывает случившееся.
    await asUser(leader);
    await db.query(`select set_chat_status($1, $2, 'invited')`, [hike, first]);

    const r = await db.query(
      `select chat_status from registrations where hike_id = $1 and user_id = $2`,
      [hike, first],
    );
    assert.equal(r.rows[0].chat_status, "invited");
  });

  it("отметку можно снять", async () => {
    // Ровно этого не хватало отметкам явки: промахнулся по строке в списке
    // из двадцати человек — и вернуть «не трогал» было нечем.
    await asUser(leader);
    await db.query(`select set_chat_status($1, $2, null)`, [hike, first]);

    const r = await db.query(
      `select chat_status, chat_status_at from registrations
        where hike_id = $1 and user_id = $2`,
      [hike, first],
    );
    assert.equal(r.rows[0].chat_status, null);
    assert.equal(r.rows[0].chat_status_at, null);
  });

  it("выдуманный статус не проходит", async () => {
    await asUser(leader);
    await rejectsWith("BAD_CHAT_STATUS", () =>
      db.query(`select set_chat_status($1, $2, 'added_maybe')`, [hike, first]),
    );
  });

  it("лидер чужого похода отметить не может", async () => {
    await asUser(stranger);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select set_chat_status($1, $2, 'added')`, [hike, first]),
    );
  });

  it("незаписанного отметить нечем", async () => {
    await asUser(leader);
    await rejectsWith("NOT_REGISTERED", () =>
      db.query(`select set_chat_status($1, $2, 'added')`, [hike, stranger]),
    );
  });

  it("подъём из очереди отмечается временем", async () => {
    // Без promoted_at поднявшийся неотличим от записавшегося на свободное
    // место: waitlist_pos при подъёме обнуляется. А лидеру разница нужна —
    // поднявшийся не знает, что идёт, уведомлений в проекте нет.
    const before = await db.query(
      `select status, promoted_at from registrations
        where hike_id = $1 and user_id = $2`,
      [hike, second],
    );
    assert.equal(before.rows[0].status, "waitlist");
    assert.equal(before.rows[0].promoted_at, null);

    await asUser(first);
    await db.query(`select cancel_registration($1)`, [hike]);

    const after = await db.query(
      `select status, promoted_at from registrations
        where hike_id = $1 and user_id = $2`,
      [hike, second],
    );
    assert.equal(after.rows[0].status, "confirmed");
    assert.notEqual(after.rows[0].promoted_at, null, "подъём не отмечен");
  });

  it("отметка переживает отмену записи", async () => {
    // Отменившийся остаётся в чате, пока лидер его оттуда не уберёт, —
    // значит отметку стирать нельзя, она и есть «он там».
    await asUser(leader);
    await db.query(`select set_chat_status($1, $2, 'added')`, [hike, second]);
    await db.query(`select cancel_registration($1, $2)`, [hike, second]);

    const r = await db.query(
      `select status, chat_status from registrations
        where hike_id = $1 and user_id = $2`,
      [hike, second],
    );
    assert.equal(r.rows[0].status, "cancelled");
    assert.equal(r.rows[0].chat_status, "added");
  });
});

describe("поход становится прошедшим", () => {
  let leader, walker, past, upcoming;

  async function mk(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member', role = coalesce($2, role)
        where id = $1`,
      [id, role],
    );
    return id;
  }

  /** startsAt — выражение SQL, а не значение: интервал параметром не передать. */
  async function makeHike(slug, startsAt, status = "published") {
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ($1, 'Поход', 1, ${startsAt}, 10, $2, $3, true)
       returning id`,
      [slug, status, leader],
    );
    return h.rows[0].id;
  }

  before(async () => {
    leader = await mk("closer@narxoz.kz", "Лидер Закрывающий", "leader");
    walker = await mk("walker@narxoz.kz", "Участник Ходячий", null);

    past = await makeHike("closed-hike", "now() - interval '3 hours'");
    upcoming = await makeHike("open-hike", "now() + interval '1 hour'");

    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [past, walker]);
    await db.query(`select register_participant($1, $2)`, [upcoming, walker]);
  });

  it("отметка явки закрывает поход", async () => {
    await asUser(leader);
    await db.query(`select mark_attendance($1, $2, 'completed')`, [past, walker]);

    const r = await db.query(`select status from hikes where id = $1`, [past]);
    assert.equal(r.rows[0].status, "completed");
  });

  it("снятие отметки статус не откатывает", async () => {
    // Поход состоялся, даже если лидер стёр все отметки. Обратный ход
    // означал бы, что промах по кнопке «снять» переписывает историю клуба.
    await asUser(leader);
    await db.query(`select clear_attendance($1, $2)`, [past, walker]);

    const r = await db.query(`select status from hikes where id = $1`, [past]);
    assert.equal(r.rows[0].status, "completed");
  });

  it("отметка на точке сбора не закрывает поход до выхода", async () => {
    // Окно отметок открывается за два часа ДО выхода, а «Ближайшие»
    // показывают только published: закройся поход на сборе — он исчез бы
    // из одной вкладки, не появившись в другой, ровно пока группа идёт.
    await asUser(leader);
    await db.query(`select mark_attendance($1, $2, 'completed')`, [
      upcoming,
      walker,
    ]);

    const r = await db.query(`select status from hikes where id = $1`, [upcoming]);
    assert.equal(r.rows[0].status, "published", "поход закрылся до выхода");
  });

  it("отменённый поход прошедшим не становится", async () => {
    // Записываем, пока поход жив: register_participant отбивает запись на
    // отменённый поход, а нам нужна отметка явки на нём.
    const cancelled = await makeHike("cancelled-hike", "now() - interval '3 hours'");
    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [cancelled, walker]);
    await db.query(`update hikes set status = 'cancelled' where id = $1`, [
      cancelled,
    ]);
    await db.query(`select mark_attendance($1, $2, 'no_show')`, [
      cancelled,
      walker,
    ]);

    const r = await db.query(`select status from hikes where id = $1`, [cancelled]);
    assert.equal(r.rows[0].status, "cancelled");
  });
});

describe("физическая форма обязательна", () => {
  let person;

  before(async () => {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('fit@narxoz.kz', jsonb_build_object('full_name', 'Форма Проверочная'))
       returning id`,
    );
    person = u.rows[0].id;
    await db.query(
      `update profiles
          set phone = '+77764443322', birth_date = '2004-04-04',
              consent_pd_at = now(), membership_status = 'member'
        where id = $1`,
      [person],
    );
    await db.query(
      `insert into emergency_contacts (user_id, full_name, phone)
       values ($1, 'Мама', '+77764443311')`,
      [person],
    );
  });

  it("без неё профиль неполон", async () => {
    // Всё остальное заполнено — значит проверка ловит именно это поле.
    const r = await db.query(`select profile_is_complete($1) as ok`, [person]);
    assert.equal(r.rows[0].ok, false);
  });

  it("с ней профиль полон", async () => {
    await db.query(`update profiles set fitness_level = 2 where id = $1`, [person]);

    const r = await db.query(`select profile_is_complete($1) as ok`, [person]);
    assert.equal(r.rows[0].ok, true);
  });

  it("ступеней ровно три", async () => {
    // Шкала — часть договорённости, а не украшение: «низкий-средний-высокий»
    // из пяти делений превращается в «все выбрали середину».
    await rejectsWith("profiles_fitness_level_range", () =>
      db.query(`update profiles set fitness_level = 4 where id = $1`, [person]),
    );
    await rejectsWith("profiles_fitness_level_range", () =>
      db.query(`update profiles set fitness_level = 0 where id = $1`, [person]),
    );
  });
});

describe("удаление своих данных", () => {
  let leaver, keeper, boss, past, future;

  async function mk(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member', role = coalesce($2, role)
        where id = $1`,
      [id, role],
    );
    return id;
  }

  before(async () => {
    boss = await mk("del-lead@narxoz.kz", "Лидер Удаляющий", "leader");
    leaver = await mk("del-me@narxoz.kz", "Уходящий Совсем", null);
    keeper = await mk("del-stay@narxoz.kz", "Остающийся Вечно", null);

    await db.query(
      `insert into emergency_contacts (user_id, full_name, phone)
       values ($1, 'Мама уходящего', '+77761112233')`,
      [leaver],
    );

    const h1 = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('del-past', 'Прошедший', 1, now() - interval '30 days', 10,
               'published', $1, true) returning id`,
      [boss],
    );
    past = h1.rows[0].id;

    // Одно место: уходящий занимает его, остающийся стоит в очереди.
    const h2 = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('del-future', 'Будущий', 1, now() + interval '20 days', 1,
               'published', $1, true) returning id`,
      [boss],
    );
    future = h2.rows[0].id;

    await asUser(boss);
    await db.query(`select register_participant($1, $2)`, [past, leaver]);
    await db.query(`select register_participant($1, $2)`, [future, leaver]);
    await db.query(`select register_participant($1, $2)`, [future, keeper]);
  });

  it("чужой профиль обычному человеку не стереть", async () => {
    // Доступ к контактам своей группы — не то же самое, что право стереть
    // человека из клуба, поэтому лидеру этого тоже не дают.
    await asUser(boss);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select delete_account($1)`, [keeper]),
    );
  });

  it("ответственный за будущий поход сначала передаёт его", async () => {
    await asUser(boss);
    await rejectsWith("LEADS_FUTURE_HIKE", () =>
      db.query(`select delete_account()`),
    );
  });

  it("место на будущем походе уходит первому из очереди", async () => {
    const before = await db.query(
      `select status from registrations where hike_id = $1 and user_id = $2`,
      [future, keeper],
    );
    assert.equal(before.rows[0].status, "waitlist");

    await asUser(leaver);
    await db.query(`select delete_account()`);

    const after = await db.query(
      `select status from registrations where hike_id = $1 and user_id = $2`,
      [future, keeper],
    );
    assert.equal(after.rows[0].status, "confirmed", "место не досталось очереди");
  });

  it("уносит профиль, контакты и записи целиком", async () => {
    for (const [table, column] of [
      ["profiles", "id"],
      ["emergency_contacts", "user_id"],
      ["registrations", "user_id"],
    ]) {
      const r = await db.query(
        `select count(*)::int as n from ${table} where ${column} = $1`,
        [leaver],
      );
      assert.equal(r.rows[0].n, 0, `${table} пережил удаление`);
    }
  });

  it("счётчики мест сходятся после удаления", async () => {
    // Каскад просто уносит строку, и место осталось бы занятым мёртвой душой.
    const r = await db.query(
      `select h.confirmed_count,
              (select count(*) from registrations r
                where r.hike_id = h.id and r.status = 'confirmed' and not r.as_leader)::int as real
         from hikes h where h.id = $1`,
      [future],
    );
    assert.equal(r.rows[0].confirmed_count, r.rows[0].real);
  });
});

describe("срок хранения", () => {
  // Живой случай 13 сентября 2026: «Пора стереть — 252», почти весь набор
  // 31 августа, у каждого «Ни одного похода, профиль с 31 августа». Вьюха
  // считала год без походов и не смотрела, сколько живёт сам профиль.
  let fresh, idleOld, goneOld, activeOld;

  async function mk(email, name, age) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member',
                           created_at = now() - $2::interval
        where id = $1`,
      [id, age],
    );
    return id;
  }

  const staleIds = async () =>
    (await db.query(`select id from stale_profiles`)).rows.map((r) => r.id);

  before(async () => {
    fresh = await mk("stale-fresh@narxoz.kz", "Свежий Набор", "13 days");
    idleOld = await mk("stale-idle@narxoz.kz", "Давний Нехоженый", "13 months");
    goneOld = await mk("stale-gone@narxoz.kz", "Давно Ходивший", "2 years");
    activeOld = await mk("stale-active@narxoz.kz", "Недавно Ходивший", "2 years");

    const lead = await mk("stale-lead@narxoz.kz", "Лидер Сроков", "2 years");
    await db.query(`update profiles set role = 'leader' where id = $1`, [lead]);

    const longAgo = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('stale-long-ago', 'Давний', 1, now() - interval '14 months', 10,
               'published', $1, true) returning id`,
      [lead],
    );
    const recent = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('stale-recent', 'Недавний', 1, now() - interval '2 months', 10,
               'published', $1, true) returning id`,
      [lead],
    );

    await asUser(lead);
    await db.query(`select register_participant($1, $2)`, [longAgo.rows[0].id, goneOld]);
    await db.query(`select register_participant($1, $2)`, [recent.rows[0].id, activeOld]);
  });

  it("свежий профиль без походов не просрочен", async () => {
    // Год ему ещё не достался: отсчёт у того, кто не ходил, — от регистрации.
    assert.ok(!(await staleIds()).includes(fresh), "свежий набор в «Пора стереть»");
  });

  it("год с регистрации без единого похода — просрочен", async () => {
    assert.ok((await staleIds()).includes(idleOld));
  });

  it("последний поход больше года назад — просрочен", async () => {
    assert.ok((await staleIds()).includes(goneOld));
  });

  it("поход в пределах года держит профиль, как бы стар он ни был", async () => {
    // Контрольный: обязан проходить и на старой вьюхе, иначе проверял бы
    // наличие правки, а не её точность.
    assert.ok(!(await staleIds()).includes(activeOld));
  });
});

describe("справочник клуба", () => {
  let boss, walker, outsider;

  async function mk(email, name, role, status) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set role = coalesce($2, role), membership_status = $3
        where id = $1`,
      [id, role, status],
    );
    return id;
  }

  before(async () => {
    boss = await mk("dir-lead@narxoz.kz", "Лидер Справочный", "leader", "member");
    walker = await mk("dir-walk@narxoz.kz", "Участник Обычный", null, "member");
    outsider = await mk("dir-out@narxoz.kz", "Гость Случайный", null, "guest");
  });

  it("лидер видит клуб целиком", async () => {
    // Это и есть сдвиг границы: до справочника лидер видел только гостей,
    // заявки и людей со своих походов.
    await asUser(boss);
    const r = await db.query(
      `select count(*)::int as n from club_directory where id in ($1, $2, $3)`,
      [boss, walker, outsider],
    );
    assert.equal(r.rows[0].n, 3);
  });

  it("обычному участнику справочник пуст", async () => {
    // Вьюха обходит RLS, и без условия is_staff() внутри она отдала бы клуб
    // целиком любому вошедшему.
    await asUser(walker);
    const r = await db.query(`select count(*)::int as n from club_directory`);
    assert.equal(r.rows[0].n, 0);
  });

  it("не отдаёт дату рождения и экстренные контакты", async () => {
    // Граница здесь — список колонок, а не политика: чего нет во вьюхе,
    // того через эту дверь не достать никаким запросом.
    const r = await db.query(`
      select column_name from information_schema.columns
       where table_name = 'club_directory'
    `);
    const columns = r.rows.map((x) => x.column_name);
    for (const secret of ["birth_date", "consent_pd_at", "banned_at"]) {
      assert.equal(columns.includes(secret), false, `справочник светит ${secret}`);
    }
    assert.equal(columns.includes("phone"), true, "телефон обязан быть");
  });

  it("лидер отмечает человека в общем чате и снимает отметку", async () => {
    await asUser(boss);
    await db.query(`select set_club_chat_status($1, 'added')`, [walker]);

    let r = await db.query(
      `select club_chat_status, club_chat_status_at from profiles where id = $1`,
      [walker],
    );
    assert.equal(r.rows[0].club_chat_status, "added");
    assert.notEqual(r.rows[0].club_chat_status_at, null);

    await db.query(`select set_club_chat_status($1, null)`, [walker]);
    r = await db.query(
      `select club_chat_status, club_chat_status_at from profiles where id = $1`,
      [walker],
    );
    assert.equal(r.rows[0].club_chat_status, null);
    assert.equal(r.rows[0].club_chat_status_at, null);
  });

  it("обычный участник отметку не ставит", async () => {
    await asUser(walker);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select set_club_chat_status($1, 'added')`, [outsider]),
    );
  });

  it("выдуманный статус не проходит", async () => {
    await asUser(boss);
    await rejectsWith("BAD_CHAT_STATUS", () =>
      db.query(`select set_club_chat_status($1, 'maybe')`, [walker]),
    );
  });
});

describe("явка в две фазы", () => {
  let leader, other, guestA, guestB, guestC, hike;

  async function mkUser(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    if (role) {
      await db.query(
        `update profiles set membership_status = 'member', role = $2 where id = $1`,
        [id, role],
      );
    }
    return id;
  }

  before(async () => {
    leader = await mkUser("phases-leader@narxoz.kz", "Лидер Фазный", "leader");
    other = await mkUser("phases-other@narxoz.kz", "Лидер Чужой", "leader");
    guestA = await mkUser("phases-a@narxoz.kz", "Гость Первый", null);
    guestB = await mkUser("phases-b@narxoz.kz", "Гость Второй", null);
    guestC = await mkUser("phases-c@narxoz.kz", "Гость Третий", null);

    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('phases-hike', 'Поход', 1, now() - interval '3 hours', 10,
               'published', $1, true)
       returning id`,
      [leader],
    );
    hike = h.rows[0].id;

    await asUser(leader);
    for (const g of [guestA, guestB, guestC]) {
      await db.query(`select register_participant($1, $2)`, [hike, g]);
    }
  });

  const statusOf = async (id) =>
    (
      await db.query(`select membership_status from profiles where id = $1`, [id])
    ).rows[0].membership_status;

  it("«Пришёл» членства не даёт", async () => {
    // Ради этого всё и затевалось: на точке сбора человек ещё никуда не
    // сходил, а «Прошёл» была единственной кнопкой, похожей по смыслу.
    await asUser(leader);
    await db.query(`select mark_attendance($1, $2, 'arrived')`, [hike, guestA]);

    assert.equal(await statusOf(guestA), "guest");
  });

  it("«Пришёл» похода не закрывает", async () => {
    // Поход уже начался — раньше этого хватало, чтобы триггер его закрыл.
    const r = await db.query(`select status from hikes where id = $1`, [hike]);
    assert.equal(r.rows[0].status, "published");
  });

  it("«Не пришёл» считается сразу, а похода тоже не закрывает", async () => {
    await asUser(leader);
    await db.query(`select mark_attendance($1, $2, 'no_show')`, [hike, guestC]);

    const p = await db.query(`select no_show_count from profiles where id = $1`, [
      guestC,
    ]);
    assert.equal(p.rows[0].no_show_count, 1, "счётчик неявок");

    const h = await db.query(`select status from hikes where id = $1`, [hike]);
    assert.equal(h.rows[0].status, "published", "поход закрылся на неявке");
  });

  it("«Все дошли» берёт только пришедших", async () => {
    await asUser(leader);
    await db.query(`select mark_attendance($1, $2, 'arrived')`, [hike, guestB]);

    const r = await db.query(`select mark_all_completed($1) as n`, [hike]);
    assert.equal(r.rows[0].n, 2, "переведено человек");

    assert.equal(await statusOf(guestA), "member", "первый стал участником");
    assert.equal(await statusOf(guestB), "member", "второй стал участником");

    // Не пришедшего кнопка не трогает: лидер жмёт её не глядя, а неявка —
    // это счётчик у живого человека.
    const c = await db.query(
      `select result from attendance where hike_id = $1 and user_id = $2`,
      [hike, guestC],
    );
    assert.equal(c.rows[0].result, "no_show", "неявку переписали");
  });

  it("и закрывает поход", async () => {
    const r = await db.query(`select status from hikes where id = $1`, [hike]);
    assert.equal(r.rows[0].status, "completed");
  });

  it("повторное нажатие ничего не переводит", async () => {
    // Переводить больше некого: все 'arrived' кончились. Лидер, нажавший
    // дважды, не должен получить ошибку — он должен получить ноль.
    await asUser(leader);
    const r = await db.query(`select mark_all_completed($1) as n`, [hike]);
    assert.equal(r.rows[0].n, 0);
  });

  it("возврат итога на «Пришёл» снимает членство за первый поход", async () => {
    await asUser(leader);
    await db.query(`select mark_attendance($1, $2, 'arrived')`, [hike, guestA]);

    assert.equal(await statusOf(guestA), "guest");
  });

  it("а «Сошёл» — тоже снимает", async () => {
    // По completed считается уровень: допуск не должен получать тот, кто
    // развернулся на первом подъёме.
    await asUser(leader);
    await db.query(`select mark_attendance($1, $2, 'completed')`, [hike, guestA]);
    assert.equal(await statusOf(guestA), "member", "подготовка");

    await db.query(`select mark_attendance($1, $2, 'turned_back')`, [
      hike,
      guestA,
    ]);
    assert.equal(await statusOf(guestA), "guest");
  });

  it("«Все дошли» чужому лидеру не даётся", async () => {
    await asUser(other);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select mark_all_completed($1)`, [hike]),
    );
  });

  it("до открытия окна отметок «Пришёл» тоже нельзя", async () => {
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('phases-far', 'Дальний', 1, now() + interval '2 days', 10,
               'published', $1, true)
       returning id`,
      [leader],
    );
    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [h.rows[0].id, guestB]);

    await rejectsWith("HIKE_NOT_STARTED", () =>
      db.query(`select mark_attendance($1, $2, 'arrived')`, [
        h.rows[0].id,
        guestB,
      ]),
    );
  });
});

describe("расширение вместимости поднимает из очереди", () => {
  let leader, hike;
  const people = [];

  async function mkUser(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member', role = $2 where id = $1`,
      [id, role ?? "participant"],
    );
    return id;
  }

  const statusOf = async (id) =>
    (
      await db.query(
        `select status, waitlist_pos from registrations
          where hike_id = $1 and user_id = $2 and status <> 'cancelled'`,
        [hike, id],
      )
    ).rows[0];

  before(async () => {
    leader = await mkUser("cap-leader@narxoz.kz", "Лидер Вместимый", "leader");
    for (let i = 0; i < 5; i++) {
      people.push(await mkUser(`cap-${i}@narxoz.kz`, `Участник ${i}`));
    }

    // Два места на пятерых: двое идут, трое стоят в очереди.
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('cap-hike', 'Тесный', 1, now() + interval '5 days', 2,
               'published', $1, true)
       returning id`,
      [leader],
    );
    hike = h.rows[0].id;

    await asUser(leader);
    for (const p of people) {
      await db.query(`select register_participant($1, $2)`, [hike, p]);
    }
  });

  it("для начала очередь действительно стоит", async () => {
    assert.equal((await statusOf(people[0])).status, "confirmed");
    assert.equal((await statusOf(people[2])).status, "waitlist");
    assert.equal((await statusOf(people[2])).waitlist_pos, 1);
    assert.equal((await statusOf(people[4])).waitlist_pos, 3);
  });

  it("+2 места поднимают ровно двоих, и в порядке очереди", async () => {
    await db.query(`update hikes set capacity = 4 where id = $1`, [hike]);

    assert.equal((await statusOf(people[2])).status, "confirmed");
    assert.equal((await statusOf(people[3])).status, "confirmed");
    // Пятый мест не дождался: их стало четыре, а не пять.
    assert.equal((await statusOf(people[4])).status, "waitlist");
  });

  it("оставшийся в очереди встаёт на первую позицию, без дыры", async () => {
    assert.equal((await statusOf(people[4])).waitlist_pos, 1);
  });

  it("счётчики на походе сходятся с записями", async () => {
    const r = await db.query(
      `select confirmed_count, waitlist_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(r.rows[0].confirmed_count, 4);
    assert.equal(r.rows[0].waitlist_count, 1);
  });

  it("свободных мест не остаётся, пока очередь не пуста", async () => {
    // Ради этого всё и затевалось: раньше место висело свободным, а человек
    // из очереди на него не попадал — и оно доставалось тому, кто нажмёт
    // «Записаться» позже всех.
    const r = await db.query(
      `select capacity - confirmed_count as free, waitlist_count
         from hikes where id = $1`,
      [hike],
    );
    assert.ok(
      r.rows[0].free === 0 || r.rows[0].waitlist_count === 0,
      "свободные места при непустой очереди",
    );
  });

  it("места с запасом поднимают всех, очередь пустеет", async () => {
    await db.query(`update hikes set capacity = 25 where id = $1`, [hike]);

    assert.equal((await statusOf(people[4])).status, "confirmed");
    const r = await db.query(
      `select confirmed_count, waitlist_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(r.rows[0].confirmed_count, 5);
    assert.equal(r.rows[0].waitlist_count, 0);
  });

  it("уменьшение вместимости никого не высаживает", async () => {
    // Снять подтверждённого человека — решение лидера и разговор с ним, а не
    // следствие правки числа в форме.
    await db.query(`update hikes set capacity = 2 where id = $1`, [hike]);

    assert.equal((await statusOf(people[4])).status, "confirmed");
    const r = await db.query(
      `select confirmed_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(r.rows[0].confirmed_count, 5);
  });

  it("правка других полей похода очереди не трогает", async () => {
    // Триггер висит на capacity, но UPDATE прилетает со всей формой разом:
    // saveHike() пишет все колонки одним оператором.
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('cap-untouched', 'Другой', 1, now() + interval '5 days', 1,
               'published', $1, true)
       returning id`,
      [leader],
    );
    const other = h.rows[0].id;

    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [other, people[0]]);
    await db.query(`select register_participant($1, $2)`, [other, people[1]]);

    await db.query(`update hikes set title = 'Переименован' where id = $1`, [
      other,
    ]);

    const r = await db.query(
      `select status from registrations
        where hike_id = $1 and user_id = $2 and status <> 'cancelled'`,
      [other, people[1]],
    );
    assert.equal(r.rows[0].status, "waitlist");
  });

  it("лидер не занимает место, освободившееся расширением", async () => {
    // Лидеры в вместимость не считаются (миграция 20260805), и подъём из
    // очереди обязан считать так же — иначе расширение на одно место
    // поднимет ноль человек там, где ведёт двое.
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('cap-leaders', 'С лидером', 1, now() + interval '5 days', 1,
               'published', $1, true)
       returning id`,
      [leader],
    );
    const withLeader = h.rows[0].id;

    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [withLeader, people[0]]);
    await db.query(`select register_participant($1, $2)`, [withLeader, people[1]]);

    await db.query(`update hikes set capacity = 2 where id = $1`, [withLeader]);

    const r = await db.query(
      `select status from registrations
        where hike_id = $1 and user_id = $2 and status <> 'cancelled'`,
      [withLeader, people[1]],
    );
    assert.equal(r.rows[0].status, "confirmed");
  });
});

describe("удаление черновика", () => {
  let author, stranger, guest, clean, touched, published;

  async function mk(email, name, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [email, name],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member', role = coalesce($2, role)
        where id = $1`,
      [id, role],
    );
    return id;
  }

  async function mkHike(slug, leader, status) {
    const r = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ($1, 'Проба', 1, now() + interval '20 days', 10, $2, $3, true)
       returning id`,
      [slug, status, leader],
    );
    return r.rows[0].id;
  }

  before(async () => {
    author = await mk("draft-author@narxoz.kz", "Автор Черновиков", "leader");
    stranger = await mk("draft-stranger@narxoz.kz", "Чужой Лидер", "leader");
    guest = await mk("draft-guest@narxoz.kz", "Записывался Однажды", null);
    clean = await mkHike("draft-clean", author, "draft");
    touched = await mkHike("draft-touched", author, "draft");
    published = await mkHike("draft-published", author, "published");

    // Снятый с публикации поход, на который успели записаться и отменить:
    // запись участника в любом статусе держит черновик от удаления.
    await db.query(
      `insert into registrations (hike_id, user_id, status, cancelled_at)
       values ($1, $2, 'cancelled', now())`,
      [touched, guest],
    );
  });

  it("чужой лидер черновик не удалит", async () => {
    await asUser(stranger);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select delete_draft_hike($1)`, [clean]),
    );
  });

  it("опубликованный поход не удаляется", async () => {
    await asUser(author);
    await rejectsWith("NOT_A_DRAFT", () =>
      db.query(`select delete_draft_hike($1)`, [published]),
    );
  });

  it("черновик с записью участника — даже отменённой — не удаляется", async () => {
    await asUser(author);
    await rejectsWith("DRAFT_HAS_REGISTRATIONS", () =>
      db.query(`select delete_draft_hike($1)`, [touched]),
    );
  });

  it("автор удаляет свой черновик вместе с составом лидеров", async () => {
    await asUser(author);
    await db.query(`select delete_draft_hike($1)`, [clean]);

    for (const [table, column] of [
      ["hikes", "id"],
      ["hike_leaders", "hike_id"],
      ["registrations", "hike_id"],
    ]) {
      const r = await db.query(
        `select count(*)::int as n from ${table} where ${column} = $1`,
        [clean],
      );
      assert.equal(r.rows[0].n, 0, `${table} пережил удаление черновика`);
    }
  });
});

describe("поздняя отмена — после закрытия записи и только своя", () => {
  let leader;
  const p = {};

  async function mk(key) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [`late-${key}@narxoz.kz`, `Поздний ${key}`],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member',
              role = case when $2 then 'leader'::user_role else role end
        where id = $1`,
      [id, key === "leader"],
    );
    return id;
  }

  /**
   * Поход, на который все записаны давно, — задолго до рубежа. Записывает
   * лидер руками: register_for_hike() после закрытия записи не пустит, а
   * проверяем здесь отмену, не запись. Время записей сдвигается назад, иначе
   * место окажется «полученным после рубежа» и поздней не будет ни одна.
   */
  async function mkHike(slug, { startsIn, closedAgo, capacity, people }) {
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ($1, 'Проба', 1, now() + $2::interval, $3, 'published', $4, true)
       returning id`,
      [slug, startsIn, capacity, leader],
    );
    const hike = h.rows[0].id;
    await asUser(leader);
    for (const person of people) {
      await db.query(`select register_participant($1, $2)`, [hike, person]);
    }
    await db.query(
      `update registrations set created_at = now() - interval '3 days'
        where hike_id = $1`,
      [hike],
    );
    if (closedAgo) {
      await db.query(
        `update hikes set registration_closes_at = now() - $2::interval
          where id = $1`,
        [hike, closedAgo],
      );
    }
    return hike;
  }

  const reg = async (hike, user) =>
    (
      await db.query(
        `select status, was_late_cancel, cancelled_by_leader, promoted_at
           from registrations where hike_id = $1 and user_id = $2
          order by created_at desc limit 1`,
        [hike, user],
      )
    ).rows[0];

  const lateCount = async (user) =>
    (
      await db.query(`select late_cancel_count from profiles where id = $1`, [user])
    ).rows[0].late_cancel_count;

  let closed;

  before(async () => {
    leader = await mk("leader");
    for (const key of ["a", "b", "c", "d", "e", "f", "g", "h"]) p[key] = await mk(key);

    // Три места: a, b, c идут, d и e в очереди. Запись закрылась час назад,
    // выход через десять часов — ровно вечер накануне из живого похода.
    closed = await mkHike("late-closed", {
      startsIn: "10 hours",
      closedAgo: "1 hour",
      capacity: 3,
      people: [p.a, p.b, p.c, p.d, p.e],
    });
  });

  it("отмена из очереди после рубежа — не поздняя", async () => {
    await asUser(p.e);
    await db.query(`select * from cancel_registration($1)`, [closed]);
    const r = await reg(closed, p.e);
    assert.equal(r.status, "cancelled");
    assert.equal(r.was_late_cancel, false);
    assert.equal(await lateCount(p.e), 0);
  });

  it("своя отмена места, взятого до рубежа, — поздняя", async () => {
    await asUser(p.a);
    await db.query(`select * from cancel_registration($1)`, [closed]);
    const r = await reg(closed, p.a);
    assert.equal(r.was_late_cancel, true);
    assert.equal(r.cancelled_by_leader, false);
    assert.equal(await lateCount(p.a), 1);
  });

  it("поднятый из очереди после рубежа отказывается — не поздняя", async () => {
    // После рубежа очередь сама не двигается: место a лидер отдаёт d руками,
    // и достаётся оно ему уже после закрытия записи.
    await asUser(leader);
    await db.query(`select take_from_waitlist($1, $2)`, [closed, p.d]);
    const promoted = await reg(closed, p.d);
    assert.equal(promoted.status, "confirmed");
    assert.ok(promoted.promoted_at, "подъём не отмечен");

    await asUser(p.d);
    await db.query(`select * from cancel_registration($1)`, [closed]);
    assert.equal((await reg(closed, p.d)).was_late_cancel, false);
    assert.equal(await lateCount(p.d), 0);
  });

  it("снятый лидером после рубежа — не поздняя, но помечен", async () => {
    await asUser(leader);
    await db.query(`select * from cancel_registration($1, $2)`, [closed, p.b]);
    const r = await reg(closed, p.b);
    assert.equal(r.was_late_cancel, false);
    assert.equal(r.cancelled_by_leader, true);
    assert.equal(await lateCount(p.b), 0);
  });

  it("своя отмена до закрытия записи — не поздняя", async () => {
    const open = await mkHike("late-open", {
      startsIn: "10 hours",
      closedAgo: null,
      capacity: 5,
      people: [p.f],
    });
    await db.query(
      `update hikes set registration_closes_at = now() + interval '1 hour'
        where id = $1`,
      [open],
    );
    await asUser(p.f);
    await db.query(`select * from cancel_registration($1)`, [open]);
    assert.equal((await reg(open, p.f)).was_late_cancel, false);
  });

  it("без закрытия записи рубеж — сутки до выхода", async () => {
    const soon = await mkHike("late-no-close-soon", {
      startsIn: "23 hours",
      closedAgo: null,
      capacity: 5,
      people: [p.g],
    });
    const later = await mkHike("late-no-close-later", {
      startsIn: "25 hours",
      closedAgo: null,
      capacity: 5,
      people: [p.h],
    });

    await asUser(p.g);
    await db.query(`select * from cancel_registration($1)`, [soon]);
    assert.equal((await reg(soon, p.g)).was_late_cancel, true, "за 23 часа — уже поздно");

    await asUser(p.h);
    await db.query(`select * from cancel_registration($1)`, [later]);
    assert.equal((await reg(later, p.h)).was_late_cancel, false, "за 25 часов — ещё нет");
  });
});

describe("после закрытия записи очередь стоит, лидер берёт руками", () => {
  let leader, other, hike;
  const p = {};

  async function mk(key, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [`freeze-${key}@narxoz.kz`, `Очередь ${key}`],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member',
              role = coalesce($2::user_role, role)
        where id = $1`,
      [id, role ?? null],
    );
    return id;
  }

  const statusOf = async (user) =>
    (
      await db.query(
        `select status, waitlist_pos, promoted_at from registrations
          where hike_id = $1 and user_id = $2 and status <> 'cancelled'`,
        [hike, user],
      )
    ).rows[0];

  before(async () => {
    leader = await mk("leader", "leader");
    other = await mk("other-leader", "leader");
    for (const key of ["a", "b", "c", "d", "e"]) p[key] = await mk(key);

    // Два места: a, b идут; c, d, e в очереди. Запись закрылась час назад.
    const h = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers, registration_closes_at)
       values ('freeze-hike', 'Застывший', 1, now() + interval '10 hours', 2,
               'published', $1, true, now() + interval '1 hour')
       returning id`,
      [leader],
    );
    hike = h.rows[0].id;
    await asUser(leader);
    for (const key of ["a", "b", "c", "d", "e"]) {
      await db.query(`select register_participant($1, $2)`, [hike, p[key]]);
    }
    await db.query(
      `update hikes set registration_closes_at = now() - interval '1 hour'
        where id = $1`,
      [hike],
    );
  });

  it("отмена после рубежа оставляет место свободным", async () => {
    await asUser(p.a);
    const r = await db.query(`select * from cancel_registration($1)`, [hike]);
    assert.equal(r.rows[0].promoted_user_id, null);
    assert.equal((await statusOf(p.c)).status, "waitlist");
    assert.equal((await statusOf(p.c)).waitlist_pos, 1);
  });

  it("расширение вместимости после рубежа тоже никого не поднимает", async () => {
    await db.query(`update hikes set capacity = 3 where id = $1`, [hike]);
    assert.equal((await statusOf(p.c)).status, "waitlist");
    const h = await db.query(
      `select confirmed_count, waitlist_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(h.rows[0].confirmed_count, 1);
    assert.equal(h.rows[0].waitlist_count, 3);
  });

  it("чужой лидер взять не может", async () => {
    await asUser(other);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select take_from_waitlist($1, $2)`, [hike, p.e]),
    );
  });

  it("лидер берёт не по порядку, очередь смыкается", async () => {
    await asUser(leader);
    await db.query(`select take_from_waitlist($1, $2)`, [hike, p.e]);
    const e = await statusOf(p.e);
    assert.equal(e.status, "confirmed");
    assert.ok(e.promoted_at, "подъём не отмечен временем");
    assert.equal((await statusOf(p.c)).waitlist_pos, 1);
    assert.equal((await statusOf(p.d)).waitlist_pos, 2);
  });

  it("не из очереди — NOT_IN_WAITLIST", async () => {
    await asUser(leader);
    await rejectsWith("NOT_IN_WAITLIST", () =>
      db.query(`select take_from_waitlist($1, $2)`, [hike, p.b]),
    );
  });

  it("сверх вместимости не берёт", async () => {
    await asUser(leader);
    await db.query(`select take_from_waitlist($1, $2)`, [hike, p.d]);
    await rejectsWith("NO_FREE_SPOT", () =>
      db.query(`select take_from_waitlist($1, $2)`, [hike, p.c]),
    );
    const h = await db.query(
      `select confirmed_count, waitlist_count from hikes where id = $1`,
      [hike],
    );
    assert.equal(h.rows[0].confirmed_count, 3);
    assert.equal(h.rows[0].waitlist_count, 1);
  });

  it("закрытие отодвинули — очередь догоняет сама", async () => {
    // Место освобождается после рубежа и стоит; лидер переносит закрытие
    // на завтра — рубеж снова впереди, и место уходит первому без нажатий.
    await asUser(p.b);
    await db.query(`select * from cancel_registration($1)`, [hike]);
    assert.equal((await statusOf(p.c)).status, "waitlist");

    await db.query(
      `update hikes set registration_closes_at = now() + interval '5 hours'
        where id = $1`,
      [hike],
    );
    assert.equal((await statusOf(p.c)).status, "confirmed");
  });

  it("до рубежа очередь по-прежнему двигается сама", async () => {
    await asUser(p.e);
    const r = await db.query(`select * from cancel_registration($1)`, [hike]);
    // Очередь пуста — поднимать некого, но и ошибки нет.
    assert.equal(r.rows[0].promoted_user_id, null);

    const h2 = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers, registration_closes_at)
       values ('freeze-open', 'Открытый', 1, now() + interval '3 days', 1,
               'published', $1, true, now() + interval '2 days')
       returning id`,
      [leader],
    );
    const open = h2.rows[0].id;
    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [open, p.a]);
    await db.query(`select register_participant($1, $2)`, [open, p.b]);
    await asUser(p.a);
    const c = await db.query(`select * from cancel_registration($1)`, [open]);
    assert.equal(c.rows[0].promoted_user_id, p.b);
  });
});

describe("отметки и «только очередь»", () => {
  let leader;
  const p = {};

  async function mk(key, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [`strike-${key}@narxoz.kz`, `Отметка ${key}`],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member',
              role = coalesce($2::user_role, role)
        where id = $1`,
      [id, role ?? null],
    );
    return id;
  }

  async function mkHike(slug, startsIn, capacity = 5) {
    const r = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ($1, $1, 1, now() + $2::interval, $3, 'published', $4, true)
       returning id`,
      [slug, startsIn, capacity, leader],
    );
    return r.rows[0].id;
  }

  /** Самостоятельная запись без проверок профиля — сама раздача мест. */
  const selfRegister = async (hike, user) =>
    (
      await db.query(
        `select * from place_registration((select h from hikes h where h.id = $1), $2, false)`,
        [hike, user],
      )
    ).rows[0];

  const strikes = async (user) =>
    (await db.query(`select * from strike_rows(array[$1::uuid])`, [user])).rows;

  const restricted = async (user) =>
    (await db.query(`select strike_restricted($1) as r`, [user])).rows[0].r;

  let noShowHike, lateHike;

  before(async () => {
    leader = await mk("leader", "leader");
    for (const key of ["noshow", "late", "clean", "queue"]) p[key] = await mk(key);

    // Неявка на походе, который уже начался.
    noShowHike = await mkHike("strike-noshow", "-3 hours");
    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [noShowHike, p.noshow]);
    await db.query(`select mark_attendance($1, $2, 'no_show')`, [noShowHike, p.noshow]);

    // Поздняя отмена: запись давно, закрытие час назад, выход вечером.
    lateHike = await mkHike("strike-late", "10 hours");
    await db.query(`select register_participant($1, $2)`, [lateHike, p.late]);
    await db.query(
      `update registrations set created_at = now() - interval '3 days' where hike_id = $1`,
      [lateHike],
    );
    await db.query(
      `update hikes set registration_closes_at = now() - interval '1 hour' where id = $1`,
      [lateHike],
    );
    await asUser(p.late);
    await db.query(`select * from cancel_registration($1)`, [lateHike]);
  });

  it("пока дата отсчёта не вписана, отметок нет ни у кого", async () => {
    assert.deepEqual(await strikes(p.noshow), []);
    assert.equal(await restricted(p.noshow), false);
  });

  it("задним числом не считается: поход раньше даты отсчёта — не в счёт", async () => {
    await db.query(`update club_settings set strikes_counted_from = now() + interval '1 day'`);
    assert.deepEqual(await strikes(p.noshow), []);
  });

  it("неявка весит 2 и сразу даёт «только очередь»", async () => {
    await db.query(`update club_settings set strikes_counted_from = now() - interval '1 day'`);
    const rows = await strikes(p.noshow);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "no_show");
    assert.equal(rows[0].weight, 2);
    assert.equal(await restricted(p.noshow), true);
  });

  it("одна поздняя отмена — отметка, но ещё не очередь", async () => {
    const rows = await strikes(p.late);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "late_cancel");
    assert.equal(rows[0].weight, 1);
    assert.equal(await restricted(p.late), false);
  });

  it("с отметками на пороге при свободных местах — в очередь", async () => {
    const hike = await mkHike("strike-next", "5 days");
    assert.equal((await selfRegister(hike, p.noshow)).status, "waitlist");
    assert.equal((await selfRegister(hike, p.clean)).status, "confirmed");
  });

  it("лидер вручную записывает мимо отметок", async () => {
    const hike = await mkHike("strike-manual", "5 days");
    await asUser(leader);
    const r = await db.query(`select * from register_participant($1, $2)`, [hike, p.noshow]);
    assert.equal(r.rows[0].status, "confirmed");
  });

  it("подъём из очереди проходит мимо, лидер берёт руками", async () => {
    const hike = await mkHike("strike-queue", "5 days", 1);
    await selfRegister(hike, p.clean);
    await selfRegister(hike, p.noshow); // первый в очереди, но с отметками
    await selfRegister(hike, p.queue);

    await asUser(p.clean);
    const c = await db.query(`select * from cancel_registration($1)`, [hike]);
    assert.equal(c.rows[0].promoted_user_id, p.queue, "поднят человек с отметками");

    // Место освободилось ещё раз — поднимать без отметок некого, лидер берёт.
    await asUser(p.queue);
    await db.query(`select * from cancel_registration($1)`, [hike]);
    await asUser(leader);
    await db.query(`select take_from_waitlist($1, $2)`, [hike, p.noshow]);
    const r = await db.query(
      `select status from registrations where hike_id = $1 and user_id = $2 and status <> 'cancelled'`,
      [hike, p.noshow],
    );
    assert.equal(r.rows[0].status, "confirmed");
  });

  it("уважительная причина снимает отметку и возвращается обратно", async () => {
    await asUser(leader);
    await db.query(`select excuse_strike($1, $2, 'no_show', true)`, [noShowHike, p.noshow]);
    assert.deepEqual(await strikes(p.noshow), []);
    assert.equal(await restricted(p.noshow), false);

    await db.query(`select excuse_strike($1, $2, 'no_show', false)`, [noShowHike, p.noshow]);
    assert.equal((await strikes(p.noshow)).length, 1);
  });

  it("снятая причиной отметка поднимает человека из очереди при свободном месте", async () => {
    const hike = await mkHike("strike-excuse-lift", "5 days", 2);
    assert.equal((await selfRegister(hike, p.noshow)).status, "waitlist");

    await asUser(leader);
    await db.query(`select excuse_strike($1, $2, 'no_show', true)`, [noShowHike, p.noshow]);
    const r = await db.query(
      `select status from registrations where hike_id = $1 and user_id = $2 and status <> 'cancelled'`,
      [hike, p.noshow],
    );
    assert.equal(r.rows[0].status, "confirmed");
    await db.query(`select excuse_strike($1, $2, 'no_show', false)`, [noShowHike, p.noshow]);
  });

  it("уважительную причину ставит только лидер того похода", async () => {
    await asUser(p.clean);
    await rejectsWith("FORBIDDEN", () =>
      db.query(`select excuse_strike($1, $2, 'no_show', true)`, [noShowHike, p.noshow]),
    );
  });

  it("чужие отметки видят только лидеры", async () => {
    await asUser(p.clean);
    await rejectsWith("FORBIDDEN", () => db.query(`select * from staff_strike_rows(null)`));
    await asUser(leader);
    const r = await db.query(`select * from staff_strike_rows(array[$1::uuid])`, [p.noshow]);
    assert.equal(r.rows.length, 1);
  });

  it("свои отметки человек видит сам", async () => {
    await asUser(p.late);
    const r = await db.query(`select * from my_strikes()`);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].kind, "late_cancel");
  });

  it("отметка сгорает, когда пройдёт положенное число походов клуба", async () => {
    // Сколько осталось, зависит от других тестов, которые тоже заводят
    // прошедшие походы, — поэтому считаем от текущего значения, а не от двух.
    const left = (await strikes(p.noshow))[0].remaining;
    assert.ok(left >= 1);
    for (let i = 0; i < left; i++) {
      assert.equal((await strikes(p.noshow)).length, 1, `сгорела раньше: после ${i}`);
      await mkHike(`strike-later-${i}`, "-1 second");
    }
    assert.deepEqual(await strikes(p.noshow), [], "не сгорела");
    assert.equal(await restricted(p.noshow), false);
  });

  it("отменённый поход отметок не даёт", async () => {
    await db.query(`update hikes set status = 'cancelled' where id = $1`, [lateHike]);
    assert.deepEqual(await strikes(p.late), []);
  });

  it("веса правятся в настройках и действуют сразу", async () => {
    await db.query(`update hikes set status = 'published' where id = $1`, [lateHike]);
    await db.query(`update club_settings set late_cancel_weight = 2`);
    assert.equal(await restricted(p.late), true);
    await db.query(`update club_settings set late_cancel_weight = 1`);
    assert.equal(await restricted(p.late), false);
  });
});

describe("справочник: лидеру засчитываются проведённые походы", () => {
  let leader, walker;

  async function mk(key, role) {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
      [`led-${key}@narxoz.kz`, `Вёл ${key}`],
    );
    const id = u.rows[0].id;
    await db.query(
      `update profiles set membership_status = 'member', role = coalesce($2::user_role, role)
        where id = $1`,
      [id, role ?? null],
    );
    return id;
  }

  async function mkHike(slug, startsIn, status = "published") {
    const r = await db.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ($1, $1, 1, now() + $2::interval, 10, $3, $4, true)
       returning id`,
      [slug, startsIn, status, leader],
    );
    return r.rows[0].id;
  }

  const row = async (id) =>
    (
      await db.query(
        `select hikes_completed, hikes_led from club_directory where id = $1`,
        [id],
      )
    ).rows[0];

  before(async () => {
    leader = await mk("leader", "leader");
    walker = await mk("walker");

    // Два прошедших похода ведёт лидер, на первый ходил участник; третий
    // впереди, четвёртый отменён — ни тот ни другой не в счёт.
    const first = await mkHike("led-first", "-10 days");
    await mkHike("led-second", "-3 days");
    await mkHike("led-future", "5 days");
    await mkHike("led-cancelled", "-5 days", "cancelled");

    await asUser(leader);
    await db.query(`select register_participant($1, $2)`, [first, walker]);
    await db.query(`select mark_attendance($1, $2, 'completed')`, [first, walker]);
  });

  it("проведённые лидером считаются, будущие и отменённые — нет", async () => {
    await asUser(leader);
    const r = await row(leader);
    assert.equal(r.hikes_led, 2);
    assert.equal(r.hikes_completed, 2);
  });

  it("участнику — по отметке явки, как раньше", async () => {
    await asUser(leader);
    const r = await row(walker);
    assert.equal(r.hikes_completed, 1);
    assert.equal(r.hikes_led, 0);
  });
});

describe("контакт на случай ЧП — не свой номер", () => {
  let person;

  before(async () => {
    const u = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('own-phone@narxoz.kz', jsonb_build_object('full_name', 'Сам Себе'))
       returning id`,
    );
    person = u.rows[0].id;
    await db.query(
      `update profiles
          set phone = '+77765550011', birth_date = '2004-04-04', fitness_level = 2,
              consent_pd_at = now(), membership_status = 'member'
        where id = $1`,
      [person],
    );
    // Вписал себя, чтобы пройти обязательное поле.
    await db.query(
      `insert into emergency_contacts (user_id, full_name, phone)
       values ($1, 'Я', '+77765550011')`,
      [person],
    );
  });

  it("свой номер в контакте — профиль неполон", async () => {
    // Всё остальное заполнено — значит проверка ловит именно это.
    const r = await db.query(`select profile_is_complete($1) as ok`, [person]);
    assert.equal(r.rows[0].ok, false);
  });

  it("исправил на чужой — профиль полон", async () => {
    await db.query(
      `update emergency_contacts set phone = '+77765550022' where user_id = $1`,
      [person],
    );
    const r = await db.query(`select profile_is_complete($1) as ok`, [person]);
    assert.equal(r.rows[0].ok, true);
  });
});
