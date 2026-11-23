-- ============================================================
-- ЛИДЕРЫ ИДУТ В ПОХОД, НО НЕ ЗАНИМАЮТ МЕСТ УЧАСТНИКОВ
--
-- До этой миграции hike_leaders и registrations не были связаны никак.
-- Лидер попадал в список группы только одним способом — записавшись как
-- обычный участник. Отсюда четыре беды сразу:
--
--   1. Пять лидеров съедали пять мест из пятнадцати.
--   2. На заполненный поход лидер вставал в лист ожидания. Собственного
--      похода. Это уже не неудобство, а поломка.
--   3. Не записался — поход не попал в его историю. Самые ходящие люди
--      клуба получали самый пустой профиль.
--   4. Экстренный контакт лидера не был привязан к походу ни к кому. У того,
--      кто ведёт группу, на маршруте нет контакта на случай ЧП — а нужен он
--      там ровно так же, как участнику.
--
-- Решение: назначение лидера само создаёт запись с флагом as_leader.
-- Такая запись живёт в ростере, в явке и в истории наравне с остальными, но
-- в вместимость не считается.
--
-- Вместимость с этого момента означает **места для участников**. Людей на
-- маршруте будет capacity + leader_count, и это показывается отдельно, чтобы
-- лидер, ставящий 15, понимал, что реально пойдёт 17.
-- ============================================================

alter table registrations
  add column as_leader boolean not null default false;

comment on column registrations.as_leader is
  'Запись лидера: в ростере есть, в вместимость не считается. Создаётся триггером из hike_leaders.';

alter table hikes
  add column leader_count int not null default 0;

comment on column hikes.leader_count is
  'Сколько лидеров идёт. Пересчитывается в refresh_hike_counters(), не вручную.';

-- ============================================================
-- СЧЁТЧИКИ
--
-- confirmed_count остаётся счётчиком участников: на нём держится «осталось
-- 4 из 25» и вся арифметика мест. Лидеры считаются отдельно.
-- ============================================================

create or replace function refresh_hike_counters(p_hike_id uuid)
returns void language sql security definer set search_path = public as $$
  update hikes h
     set confirmed_count = c.confirmed,
         waitlist_count  = c.waiting,
         leader_count    = c.leaders
    from (
      select count(*) filter (where status = 'confirmed' and not as_leader) as confirmed,
             count(*) filter (where status = 'waitlist'  and not as_leader) as waiting,
             count(*) filter (where status = 'confirmed' and as_leader)     as leaders
      from registrations where hike_id = p_hike_id
    ) c
   where h.id = p_hike_id;
$$;

-- ============================================================
-- ВМЕСТИМОСТЬ СЧИТАЕТСЯ ПО УЧАСТНИКАМ
--
-- Единственное изменение — `and not r.as_leader` в подсчёте занятых мест.
-- Блокировка строки похода и весь порядок остаются прежними: на них держится
-- защита от перебора мест при одновременном нажатии.
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

-- Отмена теперь зовёт общее продвижение вместо своей копии. Заодно чинится
-- случай, которого раньше не было: отмена записи лидера места не освобождает,
-- и очередь трогать не должна — а старый код продвинул бы кого-то, потому что
-- смотрел только на статус отменённой записи, не на вместимость.
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

  -- Запись лидера отменяется только через состав, кнопкой «убрать из
  -- лидеров». Иначе человек остался бы в hike_leaders с отменённой записью:
  -- на карточке он ведёт поход, в ростере его нет, доступ к контактам есть.
  if v_reg.as_leader then
    raise exception 'LEADER_REGISTRATION';
  end if;

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

  v_promoted := promote_from_waitlist(p_hike_id);

  -- Пересчёт позиций нужен и когда отменился человек из середины очереди,
  -- а продвижения не было. promote_from_waitlist в этом случае выходит рано.
  perform resequence_waitlist(p_hike_id);
  perform refresh_hike_counters(p_hike_id);

  return query select v_promoted;
end;
$$;

-- ============================================================
-- НАЗНАЧЕНИЕ ЛИДЕРА СОЗДАЁТ ЗАПИСЬ
-- ============================================================

/*
 * Продвижение первого из очереди было зашито внутрь cancel_registration().
 * Теперь оно нужно и здесь: перевод участника в лидеры освобождает место
 * ровно так же, как отмена. Выносим, чтобы не держать две копии одного
 * правила — разъехавшись, они дали бы поход, где место свободно, а очередь
 * стоит.
 */
create or replace function promote_from_waitlist(p_hike_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hike     hikes%rowtype;
  v_taken    int;
  v_promoted uuid;
begin
  select * into v_hike from hikes where id = p_hike_id;
  if not found then return null; end if;

  select count(*) into v_taken
  from registrations
  where hike_id = p_hike_id and status = 'confirmed' and not as_leader;

  if v_taken >= v_hike.capacity then return null; end if;

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

  perform resequence_waitlist(p_hike_id);
  return v_promoted;
end;
$$;

revoke all on function promote_from_waitlist(uuid) from public, anon, authenticated;

create or replace function sync_leader_registration()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Если человек уже записан как участник — не плодим вторую запись, а
  -- переводим эту. Заодно освобождается занятое им место, а если он стоял в
  -- очереди на собственный поход, очередь для него кончается.
  update registrations
     set as_leader    = true,
         status       = 'confirmed',
         waitlist_pos = null
   where hike_id = new.hike_id
     and user_id = new.user_id
     and status <> 'cancelled';

  if not found then
    insert into registrations (hike_id, user_id, status, as_leader)
    values (new.hike_id, new.user_id, 'confirmed', true);
  end if;

  -- Место могло освободиться: пересчитать очередь и счётчики.
  perform promote_from_waitlist(new.hike_id);
  perform refresh_hike_counters(new.hike_id);
  return new;
end;
$$;

create trigger hike_leaders_registration
  after insert on hike_leaders
  for each row execute function sync_leader_registration();

/*
 * Сняли с похода как лидера — снимаем и с похода.
 *
 * Не переводим обратно в участники: место могло уже уйти, и человек молча
 * оказался бы в листе ожидания, ничего об этом не узнав. Хочет идти
 * участником — записывается сам, обычным путём и с обычным ответом.
 */
create or replace function unsync_leader_registration()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update registrations
     set status = 'cancelled',
         cancelled_at = now()
   where hike_id = old.hike_id
     and user_id = old.user_id
     and as_leader
     and status <> 'cancelled';

  perform refresh_hike_counters(old.hike_id);
  return old;
end;
$$;

create trigger hike_leaders_unregistration
  after delete on hike_leaders
  for each row execute function unsync_leader_registration();

revoke all on function sync_leader_registration() from public, anon, authenticated;
revoke all on function unsync_leader_registration() from public, anon, authenticated;

-- ============================================================
-- УЖЕ СУЩЕСТВУЮЩИЕ ПОХОДЫ
--
-- Лидеры записаны в hike_leaders со времён прошлой миграции, а записей у них
-- нет. Порядок важен: сперва переводим тех, кто записался руками, потом
-- добавляем остальных, иначе второй шаг упрётся в registrations_unique_active.
-- ============================================================

update registrations r
   set as_leader = true, status = 'confirmed', waitlist_pos = null
  from hike_leaders hl
 where hl.hike_id = r.hike_id
   and hl.user_id = r.user_id
   and r.status <> 'cancelled';

insert into registrations (hike_id, user_id, status, as_leader)
select hl.hike_id, hl.user_id, 'confirmed', true
  from hike_leaders hl
 where not exists (
   select 1 from registrations r
    where r.hike_id = hl.hike_id
      and r.user_id = hl.user_id
      and r.status <> 'cancelled'
 );

select refresh_hike_counters(id) from hikes;
