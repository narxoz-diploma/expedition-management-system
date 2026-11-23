-- Step Up — схема базы данных (Supabase / Postgres)
--
-- Документ рабочий, не зафиксированный. Имена, типы и состав полей можно менять.
-- Что менять НЕ стоит без веской причины:
--   1. Запись в поход только через register_for_hike() с FOR UPDATE на строке похода.
--      Прямой INSERT в registrations из клиента закрыт политиками намеренно.
--   2. RLS включён на всех таблицах с персональными данными.
--   3. emergency_contacts доступны только владельцу и лидеру того похода, на который
--      человек записан.
--
-- Порядок применения: файл целиком, сверху вниз. Порядок объявлений значим —
-- функции ссылаются на таблицы, объявленные выше.

-- ============================================================
-- ТИПЫ
-- ============================================================

create type user_role           as enum ('participant', 'leader', 'admin');
create type membership_status   as enum ('guest', 'pending', 'member', 'alumni');
create type hike_status         as enum ('draft', 'published', 'cancelled', 'completed');
create type registration_status as enum ('confirmed', 'waitlist', 'cancelled');
create type attendance_result   as enum ('completed', 'turned_back', 'no_show');
create type gear_ownership      as enum ('own', 'can_borrow', 'none');

-- ============================================================
-- ПРОФИЛИ
-- ============================================================

create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null,
  phone               text,                      -- формат +7XXXXXXXXXX, ключ связи с WhatsApp
  birth_date          date,
  faculty             text,
  study_year          smallint,
  avatar_url          text,
  bio                 text,

  role                user_role not null default 'participant',
  membership_status   membership_status not null default 'guest',
  joined_at           timestamptz,
  verified_by         uuid references profiles(id),
  verification_method text,                      -- 'invite_code' | 'phone_match' | 'first_hike' | 'manual'

  consent_pd_at       timestamptz,               -- согласие на обработку персональных данных
  late_cancel_count   int not null default 0,
  no_show_count       int not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index profiles_phone_key on profiles (phone) where phone is not null;
create index profiles_membership_idx on profiles (membership_status);

-- ============================================================
-- ЭКСТРЕННЫЕ КОНТАКТЫ (повышенная чувствительность)
-- ============================================================

create table emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  full_name     text not null,
  phone         text not null,
  relation      text,                            -- 'родитель', 'супруг', 'друг'
  is_parent     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index emergency_contacts_user_idx on emergency_contacts (user_id);

-- Профиль готов к записи в поход, если есть телефон, дата рождения, согласие
-- и хотя бы один экстренный контакт.
-- Объявляется после emergency_contacts: Postgres проверяет тело SQL-функции
-- при создании, и на пустой базе ссылка вперёд уронила бы применение файла.
create or replace function profile_is_complete(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user
      and p.phone is not null
      and p.birth_date is not null
      and p.consent_pd_at is not null
      and exists (select 1 from emergency_contacts ec where ec.user_id = p.id)
  );
$$;

-- ============================================================
-- СНАРЯЖЕНИЕ
-- ============================================================

create table gear_items (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  category    text,                              -- 'обувь', 'одежда', 'снаряжение', 'безопасность'
  min_hike_category smallint default 1,          -- с какой категории становится обязательным
  sort_order  int not null default 0
);

create table user_gear (
  user_id     uuid not null references profiles(id) on delete cascade,
  gear_id     uuid not null references gear_items(id) on delete cascade,
  ownership   gear_ownership not null default 'none',
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, gear_id)
);

-- ============================================================
-- КОДЫ ВСТУПЛЕНИЯ
-- ============================================================

create table invite_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text,                              -- 'Осень 2026'
  expires_at  timestamptz,
  max_uses    int,
  uses        int not null default 0,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ПОХОДЫ
-- ============================================================

create table hikes (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  title                 text not null,
  route_name            text,                    -- 'Кок Жайляу', 'пик Серкебай'
  summary               text,
  description           text,

  category              smallint not null check (category between 1 and 5),
  distance_km           numeric(5,1),
  elevation_gain_m      int,
  duration_hours        numeric(4,1),

  starts_at             timestamptz not null,
  meeting_point         text,
  meeting_point_url     text,                    -- ссылка на карту
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,

  capacity              int not null check (capacity > 0),
  open_to_newcomers     boolean not null default false,

  -- Денормализованные счётчики. Нужны для публичного «осталось 4 из 25»:
  -- политики registrations не дают считать чужие записи с клиента, а счётчик
  -- мест по DESIGN.md — главный элемент карточки похода.
  -- Пересчитываются из registrations в refresh_hike_counters(), не вручную.
  confirmed_count       int not null default 0,
  waitlist_count        int not null default 0,

  cost_amount           int,                     -- ориентировочные расходы, тенге
  cost_note             text,                    -- 'вход в парк + такси, наличными на месте'

  cover_url             text,
  status                hike_status not null default 'draft',
  leader_id             uuid not null references profiles(id),
  cancelled_reason      text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index hikes_status_starts_idx on hikes (status, starts_at);
create index hikes_leader_idx on hikes (leader_id);

-- ============================================================
-- ЗАПИСИ
-- ============================================================

create table registrations (
  id             uuid primary key default gen_random_uuid(),
  hike_id        uuid not null references hikes(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  status         registration_status not null,
  waitlist_pos   int,
  manual_override boolean not null default false, -- лидер записал вручную, минуя проверки
  note           text,
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,
  was_late_cancel boolean not null default false
);

-- Один человек — одна активная запись на поход.
create unique index registrations_unique_active
  on registrations (hike_id, user_id)
  where status <> 'cancelled';

create index registrations_hike_idx on registrations (hike_id, status, created_at);
create index registrations_user_idx on registrations (user_id);

-- ============================================================
-- ЯВКА
-- ============================================================

create table attendance (
  id             uuid primary key default gen_random_uuid(),
  hike_id        uuid not null references hikes(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  result         attendance_result not null,
  marked_by      uuid references profiles(id),
  marked_at      timestamptz not null default now(),
  unique (hike_id, user_id)
);

create index attendance_user_idx on attendance (user_id, result);

-- ============================================================
-- ЗНАЧКИ (фаза 2, схема заложена сразу)
-- ============================================================

create table badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  icon        text,
  is_auto     boolean not null default true      -- выдаётся автоматически или руками лидера
);

create table user_badges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  badge_id    uuid not null references badges(id) on delete cascade,
  hike_id     uuid references hikes(id) on delete set null,
  awarded_by  uuid references profiles(id),
  awarded_at  timestamptz not null default now()
);

-- Значок за конкретный поход («принёс аптечку») выдаётся за каждый поход
-- отдельно, значок без похода («ни одной поздней отмены за семестр») — один раз.
create unique index user_badges_per_hike
  on user_badges (user_id, badge_id, hike_id) where hike_id is not null;
create unique index user_badges_global
  on user_badges (user_id, badge_id) where hike_id is null;

-- ============================================================
-- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ RLS
-- SECURITY DEFINER, чтобы не вызывать рекурсию политик на profiles.
-- ============================================================

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('leader','admin') from profiles where id = auth.uid()), false);
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

-- Лидер именно этого похода (или админ). Права лидера намеренно не глобальные:
-- иначе любой лидер видит телефоны участников чужих групп.
create or replace function is_hike_leader(p_hike_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.leader_id = auth.uid() from hikes h where h.id = p_hike_id),
    false
  ) or is_admin();
$$;

-- ============================================================
-- ПРОФИЛЬ ПРИ ПЕРВОМ ВХОДЕ
-- Без этого триггера первый вход через Google приводит в приложение
-- пользователя без строки в profiles, а full_name объявлен not null.
-- ============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'участник@'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- updated_at
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at  before update on profiles
  for each row execute function set_updated_at();
create trigger hikes_set_updated_at     before update on hikes
  for each row execute function set_updated_at();
create trigger user_gear_set_updated_at before update on user_gear
  for each row execute function set_updated_at();

-- ============================================================
-- ЗАЩИТА ПРИВИЛЕГИРОВАННЫХ ПОЛЕЙ ПРОФИЛЯ
--
-- RLS работает на уровне строки, а не колонки: политика, разрешающая лидеру
-- править чужой профиль, разрешила бы ему и выставить себе role = 'admin'.
-- Триггер закрывает именно колонки.
--
-- Доверенные функции ниже (redeem_invite_code, mark_attendance,
-- cancel_registration) на время своей транзакции поднимают флаг
-- app.trusted_write — иначе они не смогли бы менять статус членства
-- и счётчики от имени самого пользователя.
-- ============================================================

-- Намеренно НЕ security definer: внутри такой функции current_user равен
-- владельцу, а не вызывающей роли, и проверка ниже стала бы бессмысленной.
create or replace function guard_profile_privileges()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Служебные роли (SQL-редактор, миграции, service_role на сервере) проходят
  -- без проверки: они и так работают вне RLS, а первого админа надо чем-то
  -- назначить.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if coalesce(current_setting('app.trusted_write', true), 'off') = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role and not is_admin() then
    raise exception 'FORBIDDEN_ROLE_CHANGE';
  end if;

  if new.membership_status is distinct from old.membership_status and not is_staff() then
    raise exception 'FORBIDDEN_MEMBERSHIP_CHANGE';
  end if;

  if (new.late_cancel_count is distinct from old.late_cancel_count
      or new.no_show_count  is distinct from old.no_show_count)
     and not is_staff() then
    raise exception 'FORBIDDEN_COUNTER_CHANGE';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function guard_profile_privileges();

-- ============================================================
-- СЧЁТЧИКИ МЕСТ
-- ============================================================

-- Пересчитывает счётчики из registrations, а не инкрементит их. Дороже на
-- один count, зато счётчики не разъезжаются с реальностью после любой правки.
create or replace function refresh_hike_counters(p_hike_id uuid)
returns void language sql security definer set search_path = public as $$
  update hikes h
     set confirmed_count = c.confirmed,
         waitlist_count  = c.waiting
    from (
      select count(*) filter (where status = 'confirmed') as confirmed,
             count(*) filter (where status = 'waitlist')  as waiting
      from registrations where hike_id = p_hike_id
    ) c
   where h.id = p_hike_id;
$$;

-- Сжимает позиции в очереди до 1..n. Нужен и при продвижении, и при отмене
-- записи из середины листа ожидания — иначе в позициях появляются дыры.
create or replace function resequence_waitlist(p_hike_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  with ranked as (
    select id, row_number() over (order by waitlist_pos nulls last, created_at) as rn
    from registrations
    where hike_id = p_hike_id and status = 'waitlist'
  )
  update registrations r
     set waitlist_pos = ranked.rn
    from ranked
   where r.id = ranked.id and r.waitlist_pos is distinct from ranked.rn;
end;
$$;

-- ============================================================
-- ЗАПИСЬ В ПОХОД — атомарно, с блокировкой строки похода
-- ============================================================

-- Общее ядро записи. Вызывающий обязан уже держать блокировку строки похода.
--
-- Внимание: все ссылки на колонки внутри обязаны быть с алиасом таблицы.
-- Имена выходных параметров (status, waitlist_pos) совпадают с колонками
-- registrations, и неквалифицированная ссылка даёт ошибку
-- «column reference is ambiguous» прямо в момент записи в поход.
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
  where r.hike_id = p_hike.id and r.status = 'confirmed';

  if v_confirmed < p_hike.capacity then
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

-- Запись самим участником.
create or replace function register_for_hike(p_hike_id uuid)
returns table (status registration_status, waitlist_pos int)
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid := auth.uid();
  v_hike    hikes%rowtype;
  v_profile profiles%rowtype;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Блокировка строки похода сериализует всех конкурентов на этом походе.
  select * into v_hike from hikes where id = p_hike_id for update;
  if not found then
    raise exception 'HIKE_NOT_FOUND';
  end if;
  if v_hike.status <> 'published' then
    raise exception 'HIKE_NOT_OPEN';
  end if;
  if v_hike.registration_opens_at is not null and now() < v_hike.registration_opens_at then
    raise exception 'REGISTRATION_NOT_OPEN';
  end if;
  if v_hike.registration_closes_at is not null and now() > v_hike.registration_closes_at then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  select * into v_profile from profiles where id = v_user;

  if not profile_is_complete(v_user) then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  if v_profile.membership_status in ('guest','pending') and not v_hike.open_to_newcomers then
    raise exception 'MEMBERS_ONLY';
  end if;

  if v_profile.membership_status = 'alumni' then
    raise exception 'ALUMNI_NEEDS_MANUAL_APPROVAL';
  end if;

  return query select * from place_registration(v_hike, v_user, false);
end;
$$;

-- Запись участника лидером вручную, минуя проверки членства.
-- Это обязательный клапан: система не знает, что человек десять лет ходит
-- в горы с семьёй, и не умеет записывать alumni. Без него флаг
-- manual_override и статус alumni были бы тупиком.
-- Вместимость и лист ожидания соблюдаются как обычно.
create or replace function register_participant(p_hike_id uuid, p_user_id uuid)
returns table (status registration_status, waitlist_pos int)
language plpgsql security definer set search_path = public as $$
declare
  v_hike hikes%rowtype;
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_hike from hikes where id = p_hike_id for update;
  if not found then
    raise exception 'HIKE_NOT_FOUND';
  end if;
  if v_hike.status = 'cancelled' then
    raise exception 'HIKE_CANCELLED';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  return query select * from place_registration(v_hike, p_user_id, true);
end;
$$;

-- ============================================================
-- ОТМЕНА — с автоматическим продвижением из листа ожидания
-- ============================================================

create or replace function cancel_registration(p_hike_id uuid, p_user_id uuid default null)
returns table (promoted_user_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_actor    uuid := auth.uid();
  v_target   uuid := coalesce(p_user_id, auth.uid());
  v_hike     hikes%rowtype;
  v_reg      registrations%rowtype;
  v_promoted uuid;
  v_late     boolean;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_target <> v_actor and not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_hike from hikes where id = p_hike_id for update;
  if not found then raise exception 'HIKE_NOT_FOUND'; end if;

  select * into v_reg from registrations
  where hike_id = p_hike_id and user_id = v_target and status <> 'cancelled';
  if not found then raise exception 'NOT_REGISTERED'; end if;

  v_late := v_hike.starts_at - now() < interval '12 hours';

  update registrations
     set status = 'cancelled',
         cancelled_at = now(),
         was_late_cancel = v_late,
         waitlist_pos = null
   where id = v_reg.id;

  if v_late and v_target = v_actor then
    perform set_config('app.trusted_write', 'on', true);
    update profiles set late_cancel_count = late_cancel_count + 1 where id = v_target;
    perform set_config('app.trusted_write', 'off', true);
  end if;

  -- Освободилось подтверждённое место — поднимаем первого из очереди.
  if v_reg.status = 'confirmed' then
    select user_id into v_promoted
    from registrations
    where hike_id = p_hike_id and status = 'waitlist'
    order by waitlist_pos nulls last, created_at
    limit 1;

    if v_promoted is not null then
      update registrations
         set status = 'confirmed', waitlist_pos = null
       where hike_id = p_hike_id and user_id = v_promoted and status = 'waitlist';
    end if;
  end if;

  -- Пересчёт позиций нужен в обоих случаях: и после продвижения, и когда
  -- отменился человек из середины очереди.
  perform resequence_waitlist(p_hike_id);
  perform refresh_hike_counters(p_hike_id);

  return query select v_promoted;
end;
$$;

-- ============================================================
-- ОТМЕТКА ЯВКИ — с автоматическим переводом новичка в члены клуба
-- ============================================================

create or replace function mark_attendance(p_hike_id uuid, p_user_id uuid, p_result attendance_result)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev attendance_result;
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  select result into v_prev from attendance
  where hike_id = p_hike_id and user_id = p_user_id;

  insert into attendance (hike_id, user_id, result, marked_by)
  values (p_hike_id, p_user_id, p_result, auth.uid())
  on conflict (hike_id, user_id)
  do update set result = excluded.result, marked_by = excluded.marked_by, marked_at = now();

  -- Повторное нажатие не должно накручивать счётчик, а исправление ошибки
  -- лидером должно его откатывать. Экран явки заполняется на морозе одной
  -- рукой — двойные нажатия там норма, а не исключение.
  if p_result is distinct from v_prev then
    perform set_config('app.trusted_write', 'on', true);

    if p_result = 'no_show' then
      update profiles set no_show_count = no_show_count + 1 where id = p_user_id;
    elsif v_prev = 'no_show' then
      update profiles set no_show_count = greatest(no_show_count - 1, 0) where id = p_user_id;
    end if;

    -- Прошёл первый поход — стал участником клуба.
    if p_result = 'completed' then
      update profiles
         set membership_status = 'member',
             joined_at = coalesce(joined_at, now()),
             verification_method = coalesce(verification_method, 'first_hike'),
             verified_by = coalesce(verified_by, auth.uid())
       where id = p_user_id
         and membership_status in ('guest','pending');
    end if;

    perform set_config('app.trusted_write', 'off', true);
  end if;
end;
$$;

-- ============================================================
-- ПОГАШЕНИЕ КОДА ВСТУПЛЕНИЯ
-- ============================================================

create or replace function redeem_invite_code(p_code text)
returns membership_status
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_code invite_codes%rowtype;
  v_result membership_status;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_code from invite_codes
  where lower(code) = lower(trim(p_code)) for update;

  if not found then raise exception 'INVALID_CODE'; end if;
  if v_code.expires_at is not null and now() > v_code.expires_at then
    raise exception 'CODE_EXPIRED';
  end if;
  if v_code.max_uses is not null and v_code.uses >= v_code.max_uses then
    raise exception 'CODE_EXHAUSTED';
  end if;

  update invite_codes set uses = uses + 1 where id = v_code.id;

  perform set_config('app.trusted_write', 'on', true);
  update profiles
     set membership_status = 'member',
         joined_at = coalesce(joined_at, now()),
         verification_method = 'invite_code'
   where id = v_user and membership_status in ('guest','pending');
  perform set_config('app.trusted_write', 'off', true);

  select membership_status into v_result from profiles where id = v_user;
  return v_result;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table profiles           enable row level security;
alter table emergency_contacts enable row level security;
alter table user_gear          enable row level security;
alter table gear_items         enable row level security;
alter table hikes              enable row level security;
alter table registrations      enable row level security;
alter table attendance         enable row level security;
alter table badges             enable row level security;
alter table user_badges        enable row level security;
alter table invite_codes       enable row level security;

-- profiles: свой профиль; участники своих походов — лидеру; заявки на
-- членство — любому лидеру (для сверки по телефонам); всё — админу.
-- Публичные имена отдаются через VIEW ниже, а не этой политикой.
create policy profiles_select on profiles
  for select using (
    id = auth.uid()
    or is_admin()
    or (is_staff() and membership_status in ('guest','pending'))
    or exists (
      select 1 from registrations r
      join hikes h on h.id = r.hike_id
      where r.user_id = profiles.id
        and r.status <> 'cancelled'
        and h.leader_id = auth.uid()
    )
  );

create policy profiles_insert_self on profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_staff_update on profiles
  for update using (is_staff()) with check (is_staff());

-- emergency_contacts: владелец, либо лидер похода, на который человек записан.
create policy ec_owner on emergency_contacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ec_leader_read on emergency_contacts
  for select using (
    is_admin()
    or exists (
      select 1
      from registrations r
      join hikes h on h.id = r.hike_id
      where r.user_id = emergency_contacts.user_id
        and r.status <> 'cancelled'
        and h.leader_id = auth.uid()
    )
  );

-- gear: справочник читают все, свой набор редактирует владелец,
-- чужой — виден лидеру только по участникам его похода.
create policy gear_items_read on gear_items for select using (true);
create policy gear_items_admin on gear_items for all using (is_admin()) with check (is_admin());

create policy user_gear_owner on user_gear
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_gear_leader_read on user_gear
  for select using (
    is_admin()
    or exists (
      select 1 from registrations r
      join hikes h on h.id = r.hike_id
      where r.user_id = user_gear.user_id
        and r.status <> 'cancelled'
        and h.leader_id = auth.uid()
    )
  );

-- hikes: опубликованные видят все, черновики — только лидеры.
-- Редактирует лидер только свои походы, админ — любые (PRD §1).
create policy hikes_read_published on hikes
  for select using (status in ('published','completed','cancelled') or is_staff());

create policy hikes_leader_insert on hikes
  for insert with check (is_staff() and (leader_id = auth.uid() or is_admin()));

create policy hikes_leader_update on hikes
  for update using (leader_id = auth.uid() or is_admin())
  with check (leader_id = auth.uid() or is_admin());

create policy hikes_admin_delete on hikes
  for delete using (is_admin());

-- registrations: INSERT и UPDATE из клиента запрещены намеренно —
-- только register_for_hike() / register_participant() / cancel_registration().
create policy registrations_read on registrations
  for select using (
    user_id = auth.uid()
    or is_admin()
    or exists (select 1 from hikes h where h.id = registrations.hike_id and h.leader_id = auth.uid())
  );

-- attendance
create policy attendance_read on attendance
  for select using (
    user_id = auth.uid()
    or is_admin()
    or exists (select 1 from hikes h where h.id = attendance.hike_id and h.leader_id = auth.uid())
  );

-- badges
create policy badges_read on badges for select using (true);
create policy badges_admin on badges for all using (is_admin()) with check (is_admin());
create policy user_badges_read on user_badges for select using (true);
create policy user_badges_staff_write on user_badges
  for all using (is_staff()) with check (is_staff());

-- invite_codes: только лидеры. Участник погашает код через
-- redeem_invite_code(), которой политики не касаются.
create policy invite_codes_staff on invite_codes
  for all using (is_staff()) with check (is_staff());

-- ============================================================
-- ПУБЛИЧНЫЕ ВИТРИНЫ
--
-- Обе вьюхи намеренно созданы с security_invoker = false: они выполняются
-- с правами владельца и обходят RLS на profiles. Это единственный способ
-- показать имя лидера на карточке похода анониму, не открывая ему таблицу
-- профилей с телефонами. Состав колонок здесь — это и есть граница
-- публичности, поэтому расширять его без необходимости нельзя.
-- ============================================================

create view public_leaders with (security_invoker = false) as
  select p.id, p.full_name, p.avatar_url, p.bio
  from profiles p
  where p.role in ('leader', 'admin');

create view public_members with (security_invoker = false) as
  select p.id, p.full_name, p.avatar_url, p.membership_status,
         (select count(*) from attendance a
           where a.user_id = p.id and a.result = 'completed') as hikes_completed,
         (select coalesce(sum(h.elevation_gain_m), 0)
            from attendance a join hikes h on h.id = a.hike_id
           where a.user_id = p.id and a.result = 'completed') as total_elevation_m
  from profiles p
  where p.membership_status in ('member','alumni');

-- Лидеры нужны на публичном лендинге и карточке похода — значит и анониму.
grant select on public_leaders to anon, authenticated;
-- Список участников — только для вошедших: это всё-таки список людей клуба.
revoke all on public_members from anon;
grant select on public_members to authenticated;

-- ============================================================
-- ПРАВА
--
-- Supabase выдаёт anon и authenticated права на таблицы схемы public
-- автоматически, но полагаться на умолчания при переносе базы нельзя,
-- поэтому здесь всё выписано явно. Какие строки видно — по-прежнему решают
-- политики RLS выше; гранты открывают только саму таблицу.
--
-- registrations и attendance намеренно даны authenticated только на чтение:
-- писать в них можно исключительно через функции.
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select on hikes, gear_items, badges, user_badges to anon, authenticated;
grant select on profiles, emergency_contacts, user_gear, registrations,
                attendance, invite_codes to authenticated;

grant insert, update on profiles to authenticated;
grant insert, update, delete on emergency_contacts, user_gear to authenticated;
grant insert, update, delete on hikes to authenticated;
grant insert, update, delete on invite_codes, gear_items, badges, user_badges
  to authenticated;

-- Внутренние функции. PostgREST публикует как RPC всё, что лежит в public,
-- а эти три — SECURITY DEFINER вообще без проверки прав: снаружи ими можно
-- было бы записать кого угодно куда угодно и переписать счётчики мест.
revoke all on function place_registration(hikes, uuid, boolean)
  from public, anon, authenticated;
revoke all on function refresh_hike_counters(uuid)
  from public, anon, authenticated;
revoke all on function resequence_waitlist(uuid)
  from public, anon, authenticated;

-- ============================================================
-- SEED
-- ============================================================

insert into gear_items (slug, name, category, min_hike_category, sort_order) values
  ('boots',      'Трекинговая обувь',        'обувь',        1, 10),
  ('backpack',   'Рюкзак от 20 л',           'снаряжение',   1, 20),
  ('rain',       'Дождевик или мембрана',    'одежда',       1, 30),
  ('water',      'Ёмкость для воды 1,5 л',   'снаряжение',   1, 40),
  ('warm',       'Тёплый слой',              'одежда',       2, 50),
  ('poles',      'Трекинговые палки',        'снаряжение',   3, 60),
  ('headlamp',   'Налобный фонарь',          'безопасность', 3, 70),
  ('firstaid',   'Личная аптечка',           'безопасность', 2, 80),
  ('thermos',    'Термос',                   'снаряжение',   3, 90),
  ('spikes',     'Кошки или ледоступы',      'безопасность', 4, 100),
  ('sleeping',   'Спальник',                 'снаряжение',   5, 110);

-- Первый администратор — подставить свой id из auth.users.
-- Триггер guard_profile_privileges здесь не мешает: в SQL-редакторе Supabase
-- запрос идёт от роли postgres, для которой RLS и auth.uid() не действуют,
-- но флаг всё равно ставим явно, чтобы строка работала из любого клиента.
-- select set_config('app.trusted_write', 'on', true);
-- update profiles set role = 'admin', membership_status = 'member'
--  where id = '<uuid>';
