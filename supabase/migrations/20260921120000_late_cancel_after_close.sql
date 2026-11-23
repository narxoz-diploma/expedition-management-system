-- Поздняя отмена — после закрытия записи, и только своя.
--
-- До 21 сентября 2026 поздней считалась любая отмена меньше чем за 12 часов
-- до выхода. На живом походе это не поймало ничего: 25 мест разобрали в
-- четверг, а вечером накануне, после напоминания, отменились 17 из 25 —
-- примерно за 13–14 часов, то есть ни одна не посчиталась. И наоборот,
-- поздней отмечалось то, что ею не было:
--
--   * запись, которую снял лидер, — в списке отменившихся она выглядела так
--     же, как отказ самого человека;
--   * отмена из листа ожидания — такой человек никому не мешал, место не
--     освобождается;
--   * отказ того, кого очередь подняла ночью накануне, — опоздать с отказом
--     он не мог, место досталось ему уже после любого разумного срока.
--
-- Решение автора: рубеж — это закрытие записи. После него новых людей не
-- берут, и отказ того, кто держал место, лишает группу человека, которого
-- уже не заменить без суеты. У похода без закрытия записи рубеж — сутки до
-- выхода: рубеж должен быть всегда.
--
-- Миграция только добавляет, её можно применять раньше кода.

set local lock_timeout = '5s';

-- ============================================================
-- 1. ОТМЕТКА «УБРАН ЛИДЕРОМ»
--
-- Отдельной колонкой, а не значением was_late_cancel: это разные вопросы.
-- «Поздно ли» — про человека, «кто снял» — про то, чья это вообще отмена.
-- Существующие строки получают false: кто отменял раньше, в базе не
-- записано, и восстановить это не из чего.
-- ============================================================

alter table registrations
  add column if not exists cancelled_by_leader boolean not null default false;

comment on column registrations.cancelled_by_leader is
  'Запись снял лидер похода, а не сам человек. Поздней такая отмена не бывает.';

-- ============================================================
-- 2. РУБЕЖ
--
-- Одна функция, чтобы правило жило в одном месте: его же копирует интерфейс
-- (lib/hikes/cancel-cutoff.ts), и менять надо оба.
-- ============================================================

create or replace function cancellation_cutoff(
  p_starts_at timestamptz,
  p_registration_closes_at timestamptz
)
returns timestamptz
language sql immutable as $$
  select coalesce(p_registration_closes_at, p_starts_at - interval '24 hours');
$$;

-- ============================================================
-- 3. ОТМЕНА
-- ============================================================

create or replace function cancel_registration(p_hike_id uuid, p_user_id uuid default null)
returns table (promoted_user_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_actor     uuid := auth.uid();
  v_target    uuid := coalesce(p_user_id, auth.uid());
  v_hike      hikes%rowtype;
  v_reg       registrations%rowtype;
  v_promoted  uuid;
  v_cutoff    timestamptz;
  v_by_leader boolean;
  v_late      boolean;
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

  v_by_leader := v_target <> v_actor;
  v_cutoff := cancellation_cutoff(v_hike.starts_at, v_hike.registration_closes_at);

  -- Поздняя — только когда группа потеряла человека, на которого уже
  -- рассчитывала: он отменил сам, держал место, и место было за ним ещё до
  -- рубежа. С какого момента место его — coalesce(promoted_at, created_at):
  -- поднятый из очереди получил его при подъёме, остальные — при записи
  -- (новая запись после отмены — новая строка, created_at у неё свой).
  v_late := not v_by_leader
        and v_reg.status = 'confirmed'
        and now() > v_cutoff
        and coalesce(v_reg.promoted_at, v_reg.created_at) <= v_cutoff;

  update registrations
     set status              = 'cancelled',
         cancelled_at        = now(),
         was_late_cancel     = v_late,
         cancelled_by_leader = v_by_leader,
         waitlist_pos        = null
   where id = v_reg.id;

  if v_late then
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
