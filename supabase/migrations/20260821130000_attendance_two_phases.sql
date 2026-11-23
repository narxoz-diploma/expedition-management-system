-- Явка в две фазы: на сборе — кто пришёл, после возвращения — итог.
--
-- Продолжение 20260821120000_attendance_arrived_value.sql, где заведено
-- само значение 'arrived'. Здесь — что теперь делают функции.
--
-- ============================================================
-- 1. ОТКАТ ЧЛЕНСТВА ЖИВЁТ В ОДНОМ МЕСТЕ
--
-- Раньше «снять членство, выданное за первый поход» умела только
-- clear_attendance(): единственным способом отменить ошибочное «Прошёл»
-- было стереть отметку целиком. С двумя фазами появился второй способ —
-- поправить итог на «Сошёл» или вернуть человека в «Пришёл», — и логика
-- отката понадобилась в обеих функциях. Копия в двух местах разъехалась бы
-- на первой же правке, причём молча: человек остался бы участником клуба.
-- ============================================================

create or replace function revoke_first_hike_membership(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Снимается только членство, выданное именно за первый поход, и только
  -- если других пройденных походов не осталось. verification_method здесь и
  -- есть защита: подтверждённых по телефону, по коду и вручную это условие
  -- не трогает.
  update profiles
     set membership_status   = 'guest',
         joined_at           = null,
         verification_method = null,
         verified_by         = null
   where id = p_user_id
     and verification_method = 'first_hike'
     and not exists (
       select 1 from attendance a
        where a.user_id = p_user_id and a.result = 'completed'
     );
end;
$$;

-- Вызывается только изнутри mark_attendance() и clear_attendance(), которые
-- сами проверяют, что звонящий — лидер этого похода. Снаружи вызвать её
-- значило бы разжаловать любого участника клуба.
revoke all on function revoke_first_hike_membership(uuid) from public, anon, authenticated;

-- ============================================================
-- 2. ОТМЕТКА: 'arrived' НЕ ДЕЛАЕТ НИЧЕГО, А ОТКАТ ИТОГА — ДЕЛАЕТ
-- ============================================================

create or replace function mark_attendance(p_hike_id uuid, p_user_id uuid, p_result attendance_result)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev  attendance_result;
  v_start timestamptz;
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  select starts_at into v_start from hikes where id = p_hike_id;
  if v_start is null then
    raise exception 'HIKE_NOT_FOUND';
  end if;
  if now() < v_start - interval '2 hours' then
    raise exception 'HIKE_NOT_STARTED';
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

    -- Прошёл первый поход — стал участником клуба. 'arrived' сюда не
    -- попадает намеренно: на точке сбора он ещё никуда не сходил.
    if p_result = 'completed' then
      update profiles
         set membership_status = 'member',
             joined_at = coalesce(joined_at, now()),
             verification_method = coalesce(verification_method, 'first_hike'),
             verified_by = coalesce(verified_by, auth.uid())
       where id = p_user_id
         and membership_status in ('guest','pending');
    elsif v_prev = 'completed' then
      -- Итог поправили: «Прошёл» оказалось ошибкой, человек сошёл или ещё
      -- не дошёл. Без этой ветки промах по кнопке навсегда делал бы гостя
      -- участником клуба — а при двух фазах промахнуться стало легче.
      perform revoke_first_hike_membership(p_user_id);
    end if;

    perform set_config('app.trusted_write', 'off', true);
  end if;
end;
$$;

-- clear_attendance() теперь зовёт общий откат вместо своей копии. Всё
-- остальное в ней не менялось.
create or replace function clear_attendance(p_hike_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev attendance_result;
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  delete from attendance
   where hike_id = p_hike_id and user_id = p_user_id
   returning result into v_prev;

  -- Снимать было нечего. Не ошибка: на морозе жмут дважды, и второй раз
  -- должен молча ничего не делать.
  if v_prev is null then
    return;
  end if;

  perform set_config('app.trusted_write', 'on', true);

  if v_prev = 'no_show' then
    update profiles set no_show_count = greatest(no_show_count - 1, 0)
     where id = p_user_id;
  end if;

  if v_prev = 'completed' then
    perform revoke_first_hike_membership(p_user_id);
  end if;

  perform set_config('app.trusted_write', 'off', true);
end;
$$;

-- ============================================================
-- 3. «ВСЕ ДОШЛИ» — ОДНОЙ КНОПКОЙ
--
-- В девяти походах из десяти доходят все, и второй заход лидера должен
-- стоить три секунды, а не двадцать нажатий: он делает его дома, уставший,
-- и это единственное, что стоит между гостем и его членством в клубе.
--
-- Внутри — вызов mark_attendance() в цикле, а не свой update. Так проверка
-- прав, счётчики, членство и закрытие похода остаются в одном месте: свой
-- update пришлось бы держать в согласии с ними руками.
-- ============================================================

create or replace function mark_all_completed(p_hike_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_count int := 0;
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  -- Только отмеченные «Пришёл». Не пришедших кнопка не трогает, и это её
  -- главное свойство: лидер жмёт её не глядя, а неявка — это счётчик у
  -- живого человека. Неотмеченных тоже не трогает: про них лидер ничего не
  -- сказал, и додумывать за него нельзя.
  for v_user in
    select user_id from attendance
     where hike_id = p_hike_id and result = 'arrived'
  loop
    perform mark_attendance(p_hike_id, v_user, 'completed');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================
-- 4. ПОХОД ЗАКРЫВАЕТ ИТОГ, А НЕ ЛЮБАЯ ОТМЕТКА
--
-- Триггер закрывал поход на любой отметке после времени выхода. С 'arrived'
-- это стало неверным: лидер, отметивший пришедших с опозданием — сбор
-- затянулся, связь появилась только в автобусе, — закрыл бы поход ровно в
-- тот момент, когда группа вышла. Ту же ошибку уже ловило условие
-- starts_at <= now(), просто теперь у неё появился второй путь.
--
-- 'no_show' тоже не закрывает: его ставят на сборе, и говорит он про
-- человека, а не про поход.
-- ============================================================

create or replace function close_hike_on_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.result not in ('completed', 'turned_back') then
    return new;
  end if;

  update hikes
     set status = 'completed'
   where id = new.hike_id
     and status = 'published'
     and starts_at <= now();

  return new;
end;
$$;

revoke all on function close_hike_on_attendance() from public, anon, authenticated;
