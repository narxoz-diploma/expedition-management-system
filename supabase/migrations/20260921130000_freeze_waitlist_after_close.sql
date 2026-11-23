-- После закрытия записи очередь не двигается сама; лидер берёт из неё руками.
--
-- До 21 сентября 2026 освободившееся место уходило первому из очереди в любой
-- час, включая ночь накануне выхода. Уведомлений в проекте нет и не будет:
-- поднятый узнавал об этом, только если сам заходил на сайт, — то есть чаще
-- всего не узнавал. Лидер вечером накануне вручную снимал людей, которых
-- сайт сам поставил в состав, и они в большинстве своём и не шли: в 10 вечера
-- на выход в 8 утра не собираются. Решение автора: после рубежа (он же
-- закрытие записи, см. 20260921120000_late_cancel_after_close.sql) место
-- остаётся свободным, лидер пишет человеку в WhatsApp и, договорившись,
-- берёт его кнопкой — в любом порядке, потому что кто реально пойдёт, знает
-- лидер, а не номер в очереди.
--
-- Миграция только добавляет, её можно применять раньше кода.

-- Пересоздание триггера берёт блокировку hikes — пусть лучше упадёт и будет
-- запущена снова, чем подвесит сайт в ожидании.
set local lock_timeout = '5s';

-- ============================================================
-- 1. ПОДЪЁМ СТОИТ ПОСЛЕ РУБЕЖА
--
-- Проверка — внутри promote_from_waitlist(), а не в каждом, кто её зовёт:
-- зовут её пять мест (отмена, назначение лидера, бан, расширение
-- вместимости, удаление своих данных), и шестое, добавленное позже, забыло
-- бы про рубеж. Правило про состояние, а не про событие.
-- ============================================================

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

  select user_id into v_promoted
  from registrations
  where hike_id = p_hike_id and status = 'waitlist'
  order by waitlist_pos nulls last, created_at
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
-- 2. ЛИДЕР БЕРЁТ ИЗ ОЧЕРЕДИ
--
-- Любого, не только первого: на это и расчёт. Только на свободное место —
-- вместимость задаёт лидер, и если нужно больше людей, её и поднимают.
-- Срока нет: человек из очереди может прийти на сбор, и взять его там — тот
-- же случай.
-- ============================================================

create or replace function take_from_waitlist(p_hike_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hike  hikes%rowtype;
  v_taken int;
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  -- for update: два лидера, нажавшие «Взять» на последнее место
  -- одновременно, не должны оба его получить. Тот же замок, что у записи.
  select * into v_hike from hikes where id = p_hike_id for update;
  if not found then raise exception 'HIKE_NOT_FOUND'; end if;
  if v_hike.status = 'cancelled' then raise exception 'HIKE_CANCELLED'; end if;

  select count(*) into v_taken
  from registrations
  where hike_id = p_hike_id and status = 'confirmed' and not as_leader;
  if v_taken >= v_hike.capacity then
    raise exception 'NO_FREE_SPOT';
  end if;

  update registrations
     set status       = 'confirmed',
         waitlist_pos = null,
         promoted_at  = now()
   where hike_id = p_hike_id and user_id = p_user_id and status = 'waitlist';

  -- Политика или гонка могли сделать update пустым, и ошибки Postgres на это
  -- не даёт: «сохранено» без изменений — те же грабли, что в CLAUDE.md.
  if not found then
    raise exception 'NOT_IN_WAITLIST';
  end if;

  perform resequence_waitlist(p_hike_id);
  perform refresh_hike_counters(p_hike_id);
end;
$$;

revoke all on function take_from_waitlist(uuid, uuid) from public, anon;
grant execute on function take_from_waitlist(uuid, uuid) to authenticated;

-- ============================================================
-- 3. РУБЕЖ ОТОДВИНУЛИ — ОЧЕРЕДЬ ДОГОНЯЕТ
--
-- Если лидер переносит закрытие записи позже (или сдвигает выход у похода
-- без закрытия), рубеж снова впереди — а свободные места, оставшиеся после
-- старого рубежа, никакое событие не заполнит: отмен больше может и не
-- быть. Поэтому тот же триггер, что при расширении вместимости, теперь
-- слушает и даты.
-- ============================================================

drop trigger if exists hikes_fill_spots_on_capacity on hikes;
create trigger hikes_fill_spots_on_capacity
  after update of capacity, registration_closes_at, starts_at on hikes
  for each row
  when (
    new.capacity is distinct from old.capacity
    or new.registration_closes_at is distinct from old.registration_closes_at
    or new.starts_at is distinct from old.starts_at
  )
  execute function fill_spots_on_capacity_change();
