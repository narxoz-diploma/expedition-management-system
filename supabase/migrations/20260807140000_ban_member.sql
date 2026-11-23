-- ============================================================
-- ЗАКРЫТЬ ЧЕЛОВЕКУ ЗАПИСЬ НА ПОХОДЫ
--
-- Случай редкий, но предусмотреть его надо заранее: сочинять правила в тот
-- вечер, когда они понадобились, — худшее время.
--
-- Отдельной колонкой, а не значением membership_status. Значения там —
-- взаимоисключающие состояния принадлежности к клубу, и «забанен» затёрло бы
-- то, чем человек был: забаненного 'member' и забаненного 'alumni' потом не
-- отличить, а после прощения непонятно, во что возвращать. Плюс на этот enum
-- завязаны set_membership_status, сверка по телефонам, счётчик членов в
-- club_stats и витрина public_leaders — каждое пришлось бы проверять заново.
--
-- И не ролью: user_role — это права (participant/leader/admin), а забаненный
-- по правам обычный участник, которому закрыта одна дверь.
-- ============================================================

alter table profiles
  add column banned_at  timestamptz,
  add column ban_reason text;

comment on column profiles.banned_at is
  'Когда закрыли запись на походы. NULL — можно записываться.';
comment on column profiles.ban_reason is
  'Для клуба, не для показа: на экране причина не появляется.';

create index profiles_banned_idx on profiles (banned_at) where banned_at is not null;

-- ------------------------------------------------------------
-- СТОРОЖ
--
-- Без этого забаненный снимет бан себе сам: anon key лежит в клиентском
-- бандле, а profiles_update_self разрешает править свою строку. Тот же класс,
-- что дыра с leader_id.
--
-- Функция пересоздаётся целиком — прежние проверки на месте, добавлена
-- последняя.
-- ------------------------------------------------------------

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

  -- Именно admin, а не staff: закрыть человеку походы — не рядовое действие
  -- лидера, и снимать бан лидер тоже не должен.
  if (new.banned_at is distinct from old.banned_at
      or new.ban_reason is distinct from old.ban_reason)
     and not is_admin() then
    raise exception 'FORBIDDEN_BAN_CHANGE';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- ВЫДАЧА
--
-- Функцией, а не голым UPDATE: бан, который закрывает только новые записи,
-- бесполезен там, где он нужнее всего. Банят после происшествия, а человек
-- уже записан на ближайшие выходные — и остался бы в группе.
-- ------------------------------------------------------------

create or replace function ban_member(p_user_id uuid, p_reason text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cancelled int := 0;
  v_hike_id   uuid;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  perform set_config('app.trusted_write', 'on', true);
  update profiles
     set banned_at  = coalesce(banned_at, now()),
         ban_reason = coalesce(p_reason, ban_reason)
   where id = p_user_id;
  perform set_config('app.trusted_write', 'off', true);

  -- Только будущие и только участником. Лидерскую запись отменять нельзя:
  -- cancel_registration отобьёт её как LEADER_REGISTRATION, потому что иначе
  -- человек остался бы в составе с отменённой записью. Забаненного лидера
  -- сначала убирают из состава — руками, случай и без того исключительный.
  for v_hike_id in
    select r.hike_id
      from registrations r
      join hikes h on h.id = r.hike_id
     where r.user_id = p_user_id
       and r.status <> 'cancelled'
       and not r.as_leader
       and h.starts_at > now()
  loop
    perform cancel_registration(v_hike_id, p_user_id);
    v_cancelled := v_cancelled + 1;
  end loop;

  return v_cancelled;
end;
$$;

comment on function ban_member(uuid, text) is
  'Закрывает человеку запись и снимает его с будущих походов. Возвращает число снятых записей. Только админ.';

create or replace function unban_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- Причина стирается вместе с отметкой: колонка отвечает на вопрос «почему
  -- закрыто сейчас», а не хранит историю. Истории у нас нет и заводить её
  -- ради исключительного случая незачем.
  perform set_config('app.trusted_write', 'on', true);
  update profiles set banned_at = null, ban_reason = null where id = p_user_id;
  perform set_config('app.trusted_write', 'off', true);
end;
$$;

-- ------------------------------------------------------------
-- ЗАСЛОН НА ОБЕИХ ДВЕРЯХ
--
-- register_for_hike — вход для самого человека, register_participant — ручная
-- запись лидером. Вторую нельзя забыть: иначе лидер добавит забаненного в
-- свой поход и обойдёт всё.
--
-- Обе функции пересоздаются целиком, изменение — одна проверка в каждой.
-- ------------------------------------------------------------

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

  -- Первой из проверок профиля: незаполненный профиль забаненному чинить
  -- незачем, и отправлять его туда было бы издевательством.
  if v_profile.banned_at is not null then
    raise exception 'BANNED';
  end if;

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

  -- Ручная запись — клапан для исключений, но не для этого. Снять бан может
  -- только админ, и лидер не должен обходить его решение молча.
  if exists (select 1 from profiles where id = p_user_id and banned_at is not null) then
    raise exception 'BANNED';
  end if;

  return query select * from place_registration(v_hike, p_user_id, true);
end;
$$;
