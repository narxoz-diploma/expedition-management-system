-- Членство в клубе: подтверждение по списку телефонов и заявки.
--
-- Коды семестра и автоперевод после первого похода уже есть в первой миграции.
-- Здесь добавляется то, без чего нельзя перенести на сайт сто двадцать человек,
-- которые состоят в клубе давно.

-- ============================================================
-- ИЗВЕСТНЫЕ НОМЕРА УЧАСТНИКОВ
--
-- Лидер выгружает номера из WhatsApp-группы и вставляет их сюда списком.
-- Хранятся, а не применяются разово: иначе подтвердились бы только те, у кого
-- профиль уже есть, а человек, зарегистрировавшийся на следующий день, остался
-- бы гостем до следующей вставки. Осенью так будет постоянно.
-- ============================================================

create table known_member_phones (
  phone           text primary key,           -- строго +7XXXXXXXXXX
  note            text,                       -- 'группа, осень 2026'
  added_by        uuid references profiles(id),
  added_at        timestamptz not null default now(),
  matched_user_id uuid references profiles(id) on delete set null,
  matched_at      timestamptz,

  constraint known_member_phones_format check (phone ~ '^\+7\d{10}$')
);

create index known_member_phones_matched_idx
  on known_member_phones (matched_user_id) where matched_user_id is not null;

alter table known_member_phones enable row level security;

create policy known_phones_staff on known_member_phones
  for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on known_member_phones to authenticated;

-- ============================================================
-- АВТОПОДТВЕРЖДЕНИЕ ПО НОМЕРУ
--
-- Срабатывает, когда человек впервые указывает телефон или меняет его.
-- Лидеру для этого делать ничего не нужно — в этом и смысл.
--
-- ВАЖНО про порядок триггеров. Postgres выполняет триггеры одного типа в
-- алфавитном порядке имён, и здесь это существенно:
--   profiles_guard_privileges  — проверяет, что статус не меняет посторонний
--   profiles_match_phone       — как раз его и меняет
-- «g» идёт раньше «m», поэтому охранник видит ещё нетронутый статус и
-- пропускает запись, а подтверждение проставляется уже после него.
-- Переименование любого из двух триггеров сломает это молча.
-- ============================================================

create or replace function match_known_member_phone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone is null then
    return new;
  end if;
  if new.membership_status not in ('guest', 'pending') then
    return new;
  end if;
  if not exists (select 1 from known_member_phones k where k.phone = new.phone) then
    return new;
  end if;

  new.membership_status   := 'member';
  new.joined_at           := coalesce(new.joined_at, now());
  new.verification_method := coalesce(new.verification_method, 'phone_match');

  update known_member_phones
     set matched_user_id = new.id, matched_at = now()
   where phone = new.phone;

  return new;
end;
$$;

create trigger profiles_match_phone
  before insert or update of phone, membership_status on profiles
  for each row execute function match_known_member_phone();

-- ============================================================
-- ВСТАВКА СПИСКА НОМЕРОВ
--
-- Кладёт номера в справочник и сразу подтверждает тех, у кого профиль уже
-- есть. Будущие регистрации подхватит триггер выше.
-- ============================================================

create or replace function add_known_member_phones(p_phones text[], p_note text default null)
returns table (added int, matched_now int)
language plpgsql security definer set search_path = public as $$
declare
  v_added   int := 0;
  v_matched int := 0;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  with cleaned as (
    select distinct phone from unnest(p_phones) as phone
     where phone ~ '^\+7\d{10}$'
  ),
  inserted as (
    insert into known_member_phones (phone, note, added_by)
    select phone, p_note, auth.uid() from cleaned
    on conflict (phone) do nothing
    returning 1
  )
  select count(*) into v_added from inserted;

  -- Подтверждаем тех, кто уже зарегистрировался. Флаг нужен, потому что
  -- обновление идёт от имени лидера, а строки чужие.
  perform set_config('app.trusted_write', 'on', true);

  with promoted as (
    update profiles p
       set membership_status   = 'member',
           joined_at           = coalesce(p.joined_at, now()),
           verification_method = coalesce(p.verification_method, 'phone_match'),
           verified_by         = coalesce(p.verified_by, auth.uid())
      from known_member_phones k
     where k.phone = p.phone
       and p.membership_status in ('guest', 'pending')
    returning p.id, p.phone
  )
  select count(*) into v_matched from promoted;

  update known_member_phones k
     set matched_user_id = p.id, matched_at = now()
    from profiles p
   where p.phone = k.phone and k.matched_user_id is null;

  perform set_config('app.trusted_write', 'off', true);

  return query select v_added, v_matched;
end;
$$;

-- ============================================================
-- ЗАЯВКА НА ЧЛЕНСТВО
--
-- Для тех, кто в клубе давно, но код семестра пропустил и в списке номеров
-- его нет — например, сменил телефон. Прав заявка не даёт никаких, это
-- отметка в очереди к лидеру.
-- ============================================================

create or replace function request_membership()
returns membership_status
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_status membership_status;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select membership_status into v_status from profiles where id = v_user;
  if v_status is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_status <> 'guest' then
    raise exception 'NOTHING_TO_REQUEST';
  end if;

  perform set_config('app.trusted_write', 'on', true);
  update profiles set membership_status = 'pending' where id = v_user;
  perform set_config('app.trusted_write', 'off', true);

  return 'pending';
end;
$$;

-- ============================================================
-- РЕШЕНИЕ ЛИДЕРА ПО ЗАЯВКЕ
-- ============================================================

create or replace function set_membership_status(
  p_user_id uuid,
  p_status  membership_status
)
returns membership_status
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  perform set_config('app.trusted_write', 'on', true);

  update profiles
     set membership_status   = p_status,
         joined_at           = case
                                 when p_status = 'member' then coalesce(joined_at, now())
                                 else joined_at
                               end,
         verification_method = case
                                 when p_status = 'member' then coalesce(verification_method, 'manual')
                                 else verification_method
                               end,
         verified_by         = case
                                 when p_status = 'member' then coalesce(verified_by, auth.uid())
                                 else verified_by
                               end
   where id = p_user_id;

  perform set_config('app.trusted_write', 'off', true);

  return p_status;
end;
$$;

-- Внутренняя: снаружи её вызывать нечем, а SECURITY DEFINER без проверки
-- прав в схеме public — это RPC для всех желающих.
revoke all on function match_known_member_phone() from public, anon, authenticated;
