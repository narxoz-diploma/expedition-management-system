-- Несколько лидеров на поход.
--
-- Разводятся два разных смысла, которые до сих пор были склеены в одном поле:
--   hikes.leader_id  — кто отвечает за поход. Один, он же автор.
--   hike_leaders     — кто из лидеров физически идёт. Ноль, один или несколько.
--
-- Это не про отображение. Экстренные контакты сейчас доступны только по
-- hikes.leader_id, то есть второй лидер, реально идущий на маршрут, до них не
-- дотянется — а нужны они именно на маршруте и именно тому, кто там есть.

create table hike_leaders (
  hike_id   uuid not null references hikes(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  added_by  uuid references profiles(id),
  added_at  timestamptz not null default now(),
  primary key (hike_id, user_id)
);

create index hike_leaders_user_idx on hike_leaders (user_id);

alter table hike_leaders enable row level security;

-- ============================================================
-- КТО ЕСТЬ КТО
-- ============================================================

-- Ответственный за поход: автор либо админ. Только он меняет состав лидеров —
-- иначе один лидер мог бы вычеркнуть из своего же похода того, кто его создал.
create or replace function is_hike_responsible(p_hike_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.leader_id = auth.uid() from hikes h where h.id = p_hike_id),
    false
  ) or is_admin();
$$;

-- Лидер похода: ответственный, либо записанный в состав, либо админ.
-- SECURITY DEFINER здесь обязателен вдвойне: функция читает hike_leaders,
-- а политики этой же таблицы вызывают функцию — без обхода RLS вышла бы
-- бесконечная рекурсия.
create or replace function is_hike_leader(p_hike_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_hike_responsible(p_hike_id)
      or exists (
        select 1 from hike_leaders hl
        where hl.hike_id = p_hike_id and hl.user_id = auth.uid()
      );
$$;

-- ============================================================
-- АВТОР ПО УМОЛЧАНИЮ ИДЁТ САМ
--
-- Так чаще всего и есть. Пустой состав по умолчанию означал бы, что на
-- карточке не написано ничего, пока лидер не вспомнит про отдельный список, —
-- а он не вспомнит.
-- ============================================================

create or replace function add_hike_author_as_leader()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into hike_leaders (hike_id, user_id, added_by)
  values (new.id, new.leader_id, new.leader_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger hikes_author_leads
  after insert on hikes
  for each row execute function add_hike_author_as_leader();

-- Уже созданные походы: до сих пор лидер был ровно один.
insert into hike_leaders (hike_id, user_id, added_by)
select id, leader_id, leader_id from hikes
on conflict do nothing;

-- ============================================================
-- УПРАВЛЕНИЕ СОСТАВОМ
-- ============================================================

create or replace function add_hike_leader(p_hike_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_hike_responsible(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from profiles
    where id = p_user_id and role in ('leader', 'admin')
  ) then
    raise exception 'NOT_A_LEADER';
  end if;

  insert into hike_leaders (hike_id, user_id, added_by)
  values (p_hike_id, p_user_id, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function remove_hike_leader(p_hike_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_hike_responsible(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;
  -- Ответственного из состава не убрать: он всё равно отвечает за поход,
  -- и оставить группу без единого лидера с доступом к контактам нельзя.
  if exists (select 1 from hikes where id = p_hike_id and leader_id = p_user_id) then
    raise exception 'CANNOT_REMOVE_RESPONSIBLE';
  end if;

  delete from hike_leaders where hike_id = p_hike_id and user_id = p_user_id;
end;
$$;

-- ============================================================
-- ПОЛИТИКИ
--
-- Всё, что раньше сравнивалось с hikes.leader_id напрямую, теперь спрашивает
-- is_hike_leader(). Смысл прежний, но лидером считается и тот, кто идёт.
-- ============================================================

create policy hike_leaders_read on hike_leaders
  for select using (true);

create policy hike_leaders_write on hike_leaders
  for all using (is_hike_responsible(hike_id))
  with check (is_hike_responsible(hike_id));

grant select on hike_leaders to anon, authenticated;
grant insert, update, delete on hike_leaders to authenticated;

drop policy profiles_select on profiles;
create policy profiles_select on profiles
  for select using (
    id = auth.uid()
    or is_admin()
    or (is_staff() and membership_status in ('guest','pending'))
    or exists (
      select 1 from registrations r
      where r.user_id = profiles.id
        and r.status <> 'cancelled'
        and is_hike_leader(r.hike_id)
    )
  );

drop policy ec_leader_read on emergency_contacts;
create policy ec_leader_read on emergency_contacts
  for select using (
    is_admin()
    or exists (
      select 1 from registrations r
      where r.user_id = emergency_contacts.user_id
        and r.status <> 'cancelled'
        and is_hike_leader(r.hike_id)
    )
  );

drop policy user_gear_leader_read on user_gear;
create policy user_gear_leader_read on user_gear
  for select using (
    is_admin()
    or exists (
      select 1 from registrations r
      where r.user_id = user_gear.user_id
        and r.status <> 'cancelled'
        and is_hike_leader(r.hike_id)
    )
  );

drop policy registrations_read on registrations;
create policy registrations_read on registrations
  for select using (
    user_id = auth.uid() or is_hike_leader(hike_id)
  );

drop policy attendance_read on attendance;
create policy attendance_read on attendance
  for select using (
    user_id = auth.uid() or is_hike_leader(hike_id)
  );

-- Править поход может ответственный, идущие лидеры и админ.
-- За день до выхода меняется время сбора, автор недоступен — и если поправить
-- карточку может только он, страдает вся группа.
drop policy hikes_leader_update on hikes;
create policy hikes_leader_update on hikes
  for update using (is_hike_leader(id)) with check (is_hike_leader(id));

-- Внутренние: снаружи вызывать незачем, а SECURITY DEFINER в схеме public
-- публикуется как RPC.
revoke all on function add_hike_author_as_leader() from public, anon, authenticated;
