-- Бан не выдавался из SQL-редактора — а он туда и задуман.
--
-- ban_member проверял только is_admin(), то есть auth.uid(). В редакторе
-- Supabase JWT нет, auth.uid() пуст, и единственный предусмотренный способ
-- выдачи отвечал FORBIDDEN.
--
-- В проекте для этого уже есть приём: guard_profile_privileges пропускает
-- служебные роли по current_user. Здесь так нельзя — внутри SECURITY DEFINER
-- current_user равен владельцу функции и про звонящего не говорит ничего,
-- то есть проверка пропускала бы вообще всех. Нужен session_user: он не
-- меняется ни от SECURITY DEFINER, ни от set role.
--
-- Через PostgREST session_user — это 'authenticator', так что вызов по API
-- по-прежнему упирается в is_admin(). Прав это никому не добавляет: postgres
-- и supabase_admin и так делают с базой что угодно напрямую.

create or replace function ban_member(p_user_id uuid, p_reason text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cancelled int := 0;
  v_hike_id   uuid;
begin
  if not (is_admin() or session_user in ('postgres', 'supabase_admin')) then
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

  -- Только будущие и только участником. Лидерскую запись не трогаем: человек
  -- остался бы в составе с отменённой записью — на карточке ведёт поход, в
  -- ростере его нет. Забаненного лидера сначала убирают из состава руками.
  --
  -- Отмена здесь своя, а не через cancel_registration. Две причины. Первая —
  -- та функция требует вошедшего пользователя, а из SQL-редактора его нет,
  -- и весь этот путь упирался в NOT_AUTHENTICATED. Вторая важнее: она
  -- отметила бы отмену как позднюю и накрутила бы человеку late_cancel_count.
  -- Бан — решение клуба, а не отказ участника, и в его счётчики попадать не
  -- должен.
  for v_hike_id in
    select r.hike_id
      from registrations r
      join hikes h on h.id = r.hike_id
     where r.user_id = p_user_id
       and r.status <> 'cancelled'
       and not r.as_leader
       and h.starts_at > now()
  loop
    update registrations
       set status       = 'cancelled',
           cancelled_at = now(),
           waitlist_pos = null
     where hike_id = v_hike_id
       and user_id = p_user_id
       and status <> 'cancelled';

    -- Освободившееся место уходит очереди, как при обычной отмене.
    perform promote_from_waitlist(v_hike_id);
    perform resequence_waitlist(v_hike_id);
    perform refresh_hike_counters(v_hike_id);

    v_cancelled := v_cancelled + 1;
  end loop;

  return v_cancelled;
end;
$$;

create or replace function unban_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or session_user in ('postgres', 'supabase_admin')) then
    raise exception 'FORBIDDEN';
  end if;

  -- Причина стирается вместе с отметкой: колонка отвечает на вопрос «почему
  -- закрыто сейчас», а не хранит историю.
  perform set_config('app.trusted_write', 'on', true);
  update profiles set banned_at = null, ban_reason = null where id = p_user_id;
  perform set_config('app.trusted_write', 'off', true);
end;
$$;

-- Из клиента не вызвать вовсе. PostgREST публикует как RPC всё из схемы
-- public, а выдача бана задумана из базы — значит этой двери просто не должно
-- быть. Проверка на is_admin() внутри остаётся, но теперь она не единственное,
-- что стоит между забаненным и его разбаном.
--
-- Появится экран в админке — права выдаются обратно одной строкой, вместе с
-- ним.
revoke all on function ban_member(uuid, text)  from public, anon, authenticated;
revoke all on function unban_member(uuid)      from public, anon, authenticated;
