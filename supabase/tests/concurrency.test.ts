// Проверка конкурентности записи в поход.
//
// Запуск: npm run test:concurrency (нужен запущенный Docker)
//
// Это единственный тест, которому нужен настоящий Postgres. Он проверяет ровно
// то, ради чего вся запись сделана через SQL-функцию: сто человек жмут кнопку
// на двадцать пять мест, и перебора быть не должно.
//
// В тестах схемы (PGlite) это проверить нельзя в принципе: PGlite однопоточный,
// FOR UPDATE там нечем нагрузить — блокировке не с кем конкурировать.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { Client, Pool } from "pg";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));
const CONNECTION = {
  host: "localhost",
  port: 55432,
  user: "postgres",
  password: "test",
  database: "stepup",
};

const CAPACITY = 5;
const CONTENDERS = 20;

let pool: Pool;
let hikeId: string;
const userIds: string[] = [];

/**
 * Проверяем доступность самой базы, а не наличие контейнера.
 *
 * Раньше здесь стоял `docker inspect`, и это было неверно: для остановленного
 * контейнера команда возвращает «false», но завершается успешно — тест считал,
 * что всё готово, и падал на подключении. Заодно так тест переживает
 * Postgres, поднятый без Docker.
 */
async function databaseReachable(): Promise<boolean> {
  const probe = new Client({ ...CONNECTION, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    await probe.end();
    return true;
  } catch {
    return false;
  }
}

const skip = (await databaseReachable())
  ? false
  : `Postgres на localhost:${CONNECTION.port} недоступен — см. README, раздел «База данных»`;

describe("конкурентная запись в поход", { skip }, () => {
  before(async () => {
    const setup = new Client(CONNECTION);
    await setup.connect();

    // Чистая база на каждый прогон: тест должен быть повторяемым.
    await setup.query("drop schema if exists public cascade");
    await setup.query("drop schema if exists auth cascade");
    await setup.query("create schema public");

    await setup.query(`
      create schema auth;
      create table auth.users (
        id uuid primary key default gen_random_uuid(),
        email text,
        raw_user_meta_data jsonb
      );
      create or replace function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
      end $$;
    `);

    for (const file of readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await setup.query(readFileSync(join(MIGRATIONS, file), "utf8"));
    }

    // Лидер и участники с полностью заполненными профилями.
    const leader = await createUser(setup, "leader@narxoz.kz", 0);
    await setup.query("update profiles set role = 'leader' where id = $1", [
      leader,
    ]);

    for (let i = 1; i <= CONTENDERS; i++) {
      userIds.push(await createUser(setup, `user${i}@narxoz.kz`, i));
    }

    const hike = await setup.query(
      `insert into hikes (slug, title, category, starts_at, capacity, status,
                          leader_id, open_to_newcomers)
       values ('race-test', 'Гонка за места', 2, now() + interval '7 days', $1,
               'published', $2, true)
       returning id`,
      [CAPACITY, leader],
    );
    hikeId = hike.rows[0].id;

    await setup.end();

    // По соединению на участника: только так нажатия действительно
    // одновременны. Один клиент выполнял бы запросы по очереди, и тест
    // проходил бы даже без всякой блокировки.
    pool = new Pool({ ...CONNECTION, max: CONTENDERS });
  });

  after(async () => {
    await pool?.end();
  });

  it(`${CONTENDERS} одновременных нажатий на ${CAPACITY} мест`, async () => {
    const results = await Promise.all(
      userIds.map(async (userId) => {
        const client = await pool.connect();
        try {
          await client.query("select set_config($1, $2, false)", [
            "request.jwt.claim.sub",
            userId,
          ]);
          const res = await client.query(
            "select status, waitlist_pos from register_for_hike($1)",
            [hikeId],
          );
          return res.rows[0] as { status: string; waitlist_pos: number | null };
        } finally {
          client.release();
        }
      }),
    );

    const confirmed = results.filter((r) => r.status === "confirmed");
    const waitlisted = results.filter((r) => r.status === "waitlist");

    assert.equal(
      confirmed.length,
      CAPACITY,
      `перебор мест: подтверждено ${confirmed.length} при вместимости ${CAPACITY}`,
    );
    assert.equal(waitlisted.length, CONTENDERS - CAPACITY);
  });

  it("в базе ровно столько же, сколько ответила функция", async () => {
    const { rows } = await pool.query(
      // not as_leader: с миграции 20260805 автор похода попадает в ростер сам,
      // но места участника не занимает — без этого счёт разойдётся с вместимостью.
      `select count(*) filter (where status = 'confirmed')::int as confirmed,
              count(*) filter (where status = 'waitlist')::int  as waiting
         from registrations where hike_id = $1 and not as_leader`,
      [hikeId],
    );
    assert.equal(rows[0].confirmed, CAPACITY);
    assert.equal(rows[0].waiting, CONTENDERS - CAPACITY);
  });

  it("позиции в очереди без дыр и без дублей", async () => {
    const { rows } = await pool.query(
      `select waitlist_pos from registrations
        where hike_id = $1 and status = 'waitlist'
        order by waitlist_pos`,
      [hikeId],
    );
    const positions = rows.map((r) => r.waitlist_pos);
    assert.deepEqual(
      positions,
      Array.from({ length: CONTENDERS - CAPACITY }, (_, i) => i + 1),
      `позиции разъехались: ${positions.join(", ")}`,
    );
  });

  it("счётчик мест на походе сошёлся", async () => {
    const { rows } = await pool.query(
      "select confirmed_count, waitlist_count from hikes where id = $1",
      [hikeId],
    );
    assert.equal(rows[0].confirmed_count, CAPACITY);
    assert.equal(rows[0].waitlist_count, CONTENDERS - CAPACITY);
  });

  it("никто не записался дважды", async () => {
    const { rows } = await pool.query(
      `select user_id, count(*)::int as n from registrations
        where hike_id = $1 and status <> 'cancelled'
        group by user_id having count(*) > 1`,
      [hikeId],
    );
    assert.deepEqual(rows, [], "нашлись двойные записи");
  });

  it("одновременные отмены поднимают из очереди по одному", async () => {
    // Пятеро подтверждённых отменяются разом. Наверх должны подняться ровно
    // пятеро — не больше, иначе перебор вернётся через чёрный ход.
    // Запись лидера сюда попадать не должна: её отменяет только состав
    // похода, и cancel_registration на ней намеренно падает.
    const confirmed = await pool.query(
      `select user_id from registrations
        where hike_id = $1 and status = 'confirmed' and not as_leader`,
      [hikeId],
    );

    await Promise.all(
      confirmed.rows.map(async (row) => {
        const client = await pool.connect();
        try {
          await client.query("select set_config($1, $2, false)", [
            "request.jwt.claim.sub",
            row.user_id,
          ]);
          await client.query("select cancel_registration($1)", [hikeId]);
        } finally {
          client.release();
        }
      }),
    );

    const { rows } = await pool.query(
      // not as_leader: с миграции 20260805 автор похода попадает в ростер сам,
      // но места участника не занимает — без этого счёт разойдётся с вместимостью.
      `select count(*) filter (where status = 'confirmed')::int as confirmed,
              count(*) filter (where status = 'waitlist')::int  as waiting
         from registrations where hike_id = $1 and not as_leader`,
      [hikeId],
    );
    assert.equal(rows[0].confirmed, CAPACITY, "после отмен мест стало не столько");
    assert.equal(rows[0].waiting, CONTENDERS - CAPACITY * 2);
  });
});

async function createUser(
  client: Client,
  email: string,
  index: number,
): Promise<string> {
  const user = await client.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
    [email, `Участник ${index}`],
  );
  const id = user.rows[0].id;

  await client.query(
    `update profiles
        set phone = $2, birth_date = '2005-05-05', consent_pd_at = now(),
            membership_status = 'member'
      where id = $1`,
    [id, `+7700${String(1000000 + index).slice(0, 7)}`],
  );
  await client.query(
    `insert into emergency_contacts (user_id, full_name, phone)
     values ($1, 'Родитель', '+77010000000')`,
    [id],
  );

  return id;
}
