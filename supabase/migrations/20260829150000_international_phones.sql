-- ============================================================
-- НОМЕРА НЕ ТОЛЬКО КАЗАХСТАНСКИЕ
--
-- 29 августа 2026 лидер вставлял список группы, и один номер не прошёл:
-- индонезийский, +62. Разбор показал, что дело не в списке. Тем же
-- валидатором проверяется телефон в профиле — обязательный для записи в
-- поход — и контакт на случай ЧП. То есть студент-иностранец не мог ни
-- записаться никуда, ни вписать родителя, по которому ему будут звонить,
-- если что-то случится в горах. Сообщение при этом говорило «похоже на
-- опечатку», хотя человек не ошибся: сайт отказывал его стране.
--
-- В Narxoz есть иностранные студенты, а набор 31 августа. Отказ при этом
-- тихий: человек решает, что сайт сломан, и закрывает вкладку.
--
-- ------------------------------------------------------------
-- Что меняется
--
-- Формат хранения прежний, E.164: плюс, код страны, номер. Ширится только
-- то, какие коды принимаются: было ровно +7 и десять цифр, стало «плюс и
-- 8–15 цифр» (потолок из E.164, код страны с нуля не начинается ни у кого).
--
-- Проверка «мобильный, а не городской» осталась в приложении и только для
-- +7: это единственный код, чьи мобильные префиксы мы знаем наверняка.
-- Угадывать за полторы сотни стран — та же ошибка, что и здесь чинится.
--
-- ------------------------------------------------------------
-- Чем это оплачено
--
-- Сверка по номерам станет менее надёжной для иностранцев: привести чужой
-- номер к одному виду мы не можем. Классика — транковый ноль: внутри страны
-- номер пишут «0821…», международно «+62 821…», и человек, написавший
-- «+62 0821…», не сойдётся со списком из чата. Он останется гостем вместо
-- автоматического подтверждения и вступит по коду семестра — хуже, но не
-- сломано. Лучше без правил каждой страны не сделать.
-- ============================================================

alter table known_member_phones
  drop constraint known_member_phones_format;

alter table known_member_phones
  add constraint known_member_phones_format check (phone ~ '^\+[1-9]\d{7,14}$');

-- Тот же фильтр внутри функции: без него номер прошёл бы проверку
-- приложения, лёг в аргумент и молча отсеялся здесь.
create or replace function add_known_member_phones(p_phones text[], p_note text default null)
returns table (added int, matched_now int)
language plpgsql security definer set search_path = public as $$
declare
  v_added   int;
  v_matched int;
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  with cleaned as (
    select distinct phone from unnest(p_phones) as phone
     where phone ~ '^\+[1-9]\d{7,14}$'
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
