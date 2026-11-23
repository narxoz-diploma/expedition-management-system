-- Явка: окно отметок и возможность снять отметку.
--
-- Две беды одного экрана, обе нашлись на живом сайте.
--
-- ============================================================
-- 1. ОТМЕТИТЬ МОЖНО БЫЛО ЗА МЕСЯЦ ДО ПОХОДА
--
-- Экран состава открыт с момента создания похода, а кнопки явки на нём
-- работали всегда. Случайное касание в списке из двадцати человек ставило
-- живому человеку неявку — и счётчик, который потом смотрит лидер, набирая
-- следующую группу. Ошибка тихая: никто не заметит, пока кто-то не начнёт
-- разбираться, почему у человека «неявок: 1».
--
-- Запас в два часа до выхода — не круглое число ради красоты: лидер
-- отмечает пришедших на точке сбора, то есть до старта, а сбор назначают
-- за час-полтора. Меньше запаса — и отмечать будет нельзя ровно тогда,
-- когда это нужно.
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
-- 2. ОТМЕТКУ НЕЛЬЗЯ БЫЛО СНЯТЬ
--
-- Исправить ошибку можно было только другой отметкой: «не отмечен» обратно
-- не возвращался. А отметка не на том человеке — обычное дело на сборе, и
-- лидеру нужен способ сказать «я промахнулся», а не выбирать из трёх
-- неправильных ответов.
-- ============================================================

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

  -- Членство, выданное за первый поход, снимается вместе с отметкой — но
  -- только если оно выдано именно за него и других пройденных походов не
  -- осталось. Иначе промах по кнопке «Прошёл» навсегда делал бы гостя
  -- участником клуба, и откатить это было бы нечем.
  --
  -- verification_method здесь и есть защита: подтверждённых по телефону,
  -- по коду и вручную это условие не трогает.
  if v_prev = 'completed' then
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
  end if;

  perform set_config('app.trusted_write', 'off', true);
end;
$$;
