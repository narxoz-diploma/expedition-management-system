-- Отметки за позднюю отмену и неявку, и «только очередь» при пороге.
--
-- Повод — живой поход 20 сентября 2026: 25 мест разобрали за пять минут в
-- четверг, а вечером накануне, после напоминания, отменились 17 из 25.
-- Первые два среза (20260921120000, 20260921130000) сделали учёт честным и
-- убрали ночную суету с очередью; этот — про то, чтобы место, взятое без
-- намерения идти, чего-то стоило.
--
-- Решения автора, 21 сентября 2026:
--
--   * поздняя отмена весит 1, неявка — 2; при сумме от 2 человек
--     записывается только в очередь. Не запрет: на полном походе это то же
--     самое, а на неполном место не пропадает — лидер может взять руками;
--   * неявка тяжелее поздней отмены всегда: иначе выгоднее промолчать и не
--     прийти, а это худший исход для группы;
--   * отметка живёт не дни, а походы клуба — два состоявшихся похода после
--     того, на котором получена. В днях её можно пересидеть в сессию, когда
--     походов нет, а в походах она сработает ровно тогда, когда человек
--     снова захочет пойти. «Поход клуба» — любой опубликованный и
--     состоявшийся, кроме отменённых: два похода в одни выходные оба
--     считаются, и это принято сознательно ради простоты правила;
--   * лидер снимает отметку кнопкой «Уважительная причина» — сайт не знает,
--     заболел человек или проспал;
--   * всё это — числа в одной строке настроек, их правят в SQL-редакторе;
--   * задним числом не считается ничего: отсчёт с даты, которую автор
--     вписывает после объявления правил в чате клуба. Пока даты нет, отметок
--     нет ни у кого — миграцию можно применить заранее.
--
-- Отметки не хранятся счётчиком, а считаются из самих записей и явки при
-- каждом обращении. Счётчик late_cancel_count разошёлся с реальностью ровно
-- потому, что его накручивали в одном месте, а правило жило в другом; тут
-- расходиться нечему.
--
-- Миграция только добавляет, её можно применять раньше кода.

set local lock_timeout = '5s';

-- ============================================================
-- 1. НАСТРОЙКИ КЛУБА
--
-- Одна строка: id — boolean с check (id), вторую вставить нельзя. Политик
-- нет вовсе — читают её только функции ниже, правят в SQL-редакторе.
-- Кэша у этих чисел нет нигде: функции читают строку в момент записи,
-- поэтому правка в редакторе действует со следующего нажатия.
-- ============================================================

create table if not exists club_settings (
  id                    boolean primary key default true check (id),
  late_cancel_weight    int not null default 1 check (late_cancel_weight >= 0),
  no_show_weight        int not null default 2 check (no_show_weight >= 0),
  restriction_threshold int not null default 2 check (restriction_threshold >= 1),
  strike_lifetime_hikes int not null default 2 check (strike_lifetime_hikes >= 0),
  -- null — отметок нет ни у кого. Вписывается после объявления правил.
  strikes_counted_from  timestamptz
);

insert into club_settings (id) values (true) on conflict (id) do nothing;

alter table club_settings enable row level security;

comment on table club_settings is
  'Настройки клуба одной строкой. Правятся в SQL-редакторе, действуют сразу.';
comment on column club_settings.strike_lifetime_hikes is
  'Сколько состоявшихся походов клуба живёт отметка после того, на котором получена.';
comment on column club_settings.strikes_counted_from is
  'С какой даты похода считаются отметки. null — не считаются вовсе.';

-- ============================================================
-- 2. УВАЖИТЕЛЬНЫЕ ПРИЧИНЫ
--
-- Отдельной таблицей, а не флагом в registrations и attendance: отметка —
-- это пара «поход, человек, вид», и снятие у неё одно. Флаг в attendance
-- пропал бы, как только лидер поправит результат, а в registrations — у
-- повторной записи на тот же поход.
-- ============================================================

create table if not exists strike_excuses (
  hike_id    uuid not null references hikes(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('late_cancel', 'no_show')),
  excused_by uuid references profiles(id) on delete set null,
  excused_at timestamptz not null default now(),
  primary key (hike_id, user_id, kind)
);

alter table strike_excuses enable row level security;

-- ============================================================
-- 3. ДЕЙСТВУЮЩИЕ ОТМЕТКИ
--
-- Строка на отметку: чья, за какой поход, вид, вес и сколько походов ей
-- осталось. Порог — той же строкой, чтобы интерфейсу не нужен был второй
-- запрос. Сумма и «сколько ещё походов в очереди» считаются в
-- приложении (lib/strikes.ts): их проще проверить тестом там.
-- ============================================================

create or replace function strike_rows(p_user_ids uuid[] default null)
returns table (
  user_id        uuid,
  hike_id        uuid,
  hike_title     text,
  hike_slug      text,
  hike_starts_at timestamptz,
  kind           text,
  weight         int,
  remaining      int,
  threshold      int
)
language sql stable security definer set search_path = public as $$
  with s as (
    select * from club_settings where id
  ),
  offenses as (
    -- distinct: запись на один поход можно отменить дважды, записавшись
    -- снова, но отметка за поход — одна.
    select distinct r.user_id, r.hike_id, 'late_cancel'::text as kind
      from registrations r
      join hikes h on h.id = r.hike_id
     where r.status = 'cancelled'
       and r.was_late_cancel
       and not r.cancelled_by_leader
       and h.status <> 'cancelled'
    union
    select a.user_id, a.hike_id, 'no_show'::text
      from attendance a
      join hikes h on h.id = a.hike_id
     where a.result = 'no_show'
       and h.status <> 'cancelled'
  ),
  counted as (
    select o.user_id, o.hike_id, o.kind,
           coalesce(h.route_name, h.title) as hike_title,
           h.slug                          as hike_slug,
           h.starts_at                     as hike_starts_at,
           case o.kind when 'late_cancel' then s.late_cancel_weight
                       else s.no_show_weight end as weight,
           s.strike_lifetime_hikes - (
             select count(*)::int
               from hikes later
              where later.status in ('published', 'completed')
                and later.starts_at > h.starts_at
                and later.starts_at <= now()
           ) as remaining,
           s.restriction_threshold as threshold
      from offenses o
      join hikes h on h.id = o.hike_id
     cross join s
     where s.strikes_counted_from is not null
       and h.starts_at >= s.strikes_counted_from
       and (p_user_ids is null or o.user_id = any (p_user_ids))
       and not exists (
         select 1 from strike_excuses e
          where e.hike_id = o.hike_id and e.user_id = o.user_id and e.kind = o.kind
       )
  )
  select user_id, hike_id, hike_title, hike_slug, hike_starts_at, kind,
         weight, remaining, threshold
    from counted
   where remaining > 0 and weight > 0
   order by hike_starts_at desc;
$$;

revoke all on function strike_rows(uuid[]) from public, anon, authenticated;

create or replace function strike_restricted(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(sum(weight) >= max(threshold), false)
    from strike_rows(array[p_user_id]);
$$;

revoke all on function strike_restricted(uuid) from public, anon, authenticated;

-- Свои отметки — самому человеку, для профиля и страницы похода.
create or replace function my_strikes()
returns table (
  hike_id        uuid,
  hike_title     text,
  hike_slug      text,
  hike_starts_at timestamptz,
  kind           text,
  weight         int,
  remaining      int,
  threshold      int
)
language sql stable security definer set search_path = public as $$
  select hike_id, hike_title, hike_slug, hike_starts_at, kind, weight, remaining, threshold
    from strike_rows(array[auth.uid()])
   where auth.uid() is not null;
$$;

revoke all on function my_strikes() from public, anon;
grant execute on function my_strikes() to authenticated;

-- Чужие — только лидерам и админам: для ростера и справочника. null —
-- весь клуб, строк немного: только действующие отметки.
create or replace function staff_strike_rows(p_user_ids uuid[] default null)
returns table (
  user_id        uuid,
  hike_id        uuid,
  hike_title     text,
  hike_slug      text,
  hike_starts_at timestamptz,
  kind           text,
  weight         int,
  remaining      int,
  threshold      int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;
  return query select * from strike_rows(p_user_ids);
end;
$$;

revoke all on function staff_strike_rows(uuid[]) from public, anon;
grant execute on function staff_strike_rows(uuid[]) to authenticated;

-- ============================================================
-- 4. «ТОЛЬКО ОЧЕРЕДЬ»
--
-- Сама запись: человек с отметками на пороге встаёт в очередь даже при
-- свободных местах. Ручная запись лидером (p_manual_override) — решение
-- лидера, её отметки не трогают.
-- ============================================================

create or replace function place_registration(
  p_hike hikes,
  p_user uuid,
  p_manual_override boolean
)
returns table (status registration_status, waitlist_pos int)
language plpgsql security definer set search_path = public as $$
declare
  v_confirmed int;
  v_status    registration_status;
  v_pos       int;
begin
  select count(*) into v_confirmed
  from registrations r
  where r.hike_id = p_hike.id and r.status = 'confirmed' and not r.as_leader;

  if v_confirmed < p_hike.capacity
     and (p_manual_override or not strike_restricted(p_user)) then
    v_status := 'confirmed';
    v_pos := null;
  else
    v_status := 'waitlist';
    select coalesce(max(r.waitlist_pos), 0) + 1 into v_pos
    from registrations r
    where r.hike_id = p_hike.id and r.status = 'waitlist';
  end if;

  insert into registrations (hike_id, user_id, status, waitlist_pos, manual_override)
  values (p_hike.id, p_user, v_status, v_pos, p_manual_override);

  perform refresh_hike_counters(p_hike.id);

  return query select v_status, v_pos;
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;

-- Подъём из очереди проходит мимо таких людей: иначе «только очередь»
-- значило бы «первым в очереди». Взять их может лидер — take_from_waitlist()
-- отметок не смотрит. Записанных лидером вручную подъём не пропускает.
--
-- Известная дыра, принятая сознательно: если отметки сгорели, пока человек
-- стоит в очереди при свободном месте, само это событие его не поднимет —
-- «поход состоялся» не вызывает ничего. Поднимет следующий подъём на этом
-- походе или лидер руками. На практике запись следующего похода открывается
-- после того, как предыдущий прошёл, и такой человек записывается уже без
-- отметок; ради редкого случая заводить расписание не стали.
create or replace function promote_from_waitlist(p_hike_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hike     hikes%rowtype;
  v_taken    int;
  v_promoted uuid;
begin
  select * into v_hike from hikes where id = p_hike_id;
  if not found then return null; end if;

  if now() > cancellation_cutoff(v_hike.starts_at, v_hike.registration_closes_at) then
    return null;
  end if;

  select count(*) into v_taken
  from registrations
  where hike_id = p_hike_id and status = 'confirmed' and not as_leader;

  if v_taken >= v_hike.capacity then return null; end if;

  select r.user_id into v_promoted
  from registrations r
  where r.hike_id = p_hike_id and r.status = 'waitlist'
    and (r.manual_override or not strike_restricted(r.user_id))
  order by r.waitlist_pos nulls last, r.created_at
  limit 1;

  if v_promoted is not null then
    update registrations
       set status       = 'confirmed',
           waitlist_pos = null,
           promoted_at  = now()
     where hike_id = p_hike_id and user_id = v_promoted and status = 'waitlist';
  end if;

  perform resequence_waitlist(p_hike_id);
  return v_promoted;
end;
$$;

-- ============================================================
-- 5. УВАЖИТЕЛЬНАЯ ПРИЧИНА
--
-- Снимает и возвращает — промах по кнопке должен исправляться той же
-- кнопкой. Ставит лидер того похода, на котором получена отметка: он знает,
-- что случилось.
-- ============================================================

create or replace function excuse_strike(
  p_hike_id uuid,
  p_user_id uuid,
  p_kind    text,
  p_excused boolean
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hike uuid;
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_kind not in ('late_cancel', 'no_show') then
    raise exception 'UNKNOWN_STRIKE_KIND';
  end if;

  if p_excused then
    insert into strike_excuses (hike_id, user_id, kind, excused_by)
    values (p_hike_id, p_user_id, p_kind, auth.uid())
    on conflict (hike_id, user_id, kind) do nothing;

    -- Снятая отметка могла снять и «только очередь», а человек как раз
    -- стоит в очереди при свободном месте. Правило про состояние: догнать
    -- его здесь же, а не ждать следующей отмены. fill_open_spots() сама
    -- смотрит на рубеж и вместимость.
    for v_hike in
      select r.hike_id from registrations r join hikes h on h.id = r.hike_id
       where r.user_id = p_user_id and r.status = 'waitlist' and h.starts_at > now()
    loop
      perform * from fill_open_spots(v_hike);
      perform refresh_hike_counters(v_hike);
    end loop;
  else
    delete from strike_excuses
     where hike_id = p_hike_id and user_id = p_user_id and kind = p_kind;
  end if;
end;
$$;

revoke all on function excuse_strike(uuid, uuid, text, boolean) from public, anon;
grant execute on function excuse_strike(uuid, uuid, text, boolean) to authenticated;

-- Уважительные причины — ростеру лидера: какая из отметок на этом походе
-- уже снята. Сами строки клиенту не нужны.
create or replace function hike_strike_excuses(p_hike_id uuid)
returns table (user_id uuid, kind text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select e.user_id, e.kind from strike_excuses e where e.hike_id = p_hike_id;
end;
$$;

revoke all on function hike_strike_excuses(uuid) from public, anon;
grant execute on function hike_strike_excuses(uuid) to authenticated;

-- ============================================================
-- 6. ЧИСЛА ДЛЯ СТРАНИЦЫ ПРАВИЛ
--
-- Правила пишут веса, порог и срок числами — и берут их отсюда, а не из
-- словаря: иначе правка настроек в редакторе молча разошлась бы с текстом,
-- который люди читают. Персонального тут ничего нет, поэтому открыто всем.
-- ============================================================

create or replace function strike_settings()
returns table (
  late_cancel_weight    int,
  no_show_weight        int,
  restriction_threshold int,
  strike_lifetime_hikes int,
  active                boolean
)
language sql stable security definer set search_path = public as $$
  select late_cancel_weight, no_show_weight, restriction_threshold,
         strike_lifetime_hikes, strikes_counted_from is not null
    from club_settings where id;
$$;

grant execute on function strike_settings() to anon, authenticated;
