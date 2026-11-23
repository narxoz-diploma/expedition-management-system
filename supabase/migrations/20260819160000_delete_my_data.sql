-- Удаление своих данных и срок хранения.
--
-- ============================================================
-- ЧТО БЫЛО НЕ ТАК
--
-- Человек ушёл из клуба — его телефон, дата рождения и экстренный контакт
-- оставались навсегда. Кнопки «удалить меня» не существовало, срока хранения
-- не было, а согласие, которое человек ставит галочкой, не говорило ни о том
-- ни о другом.
--
-- Острее всего не собственные данные, а чужие: в emergency_contacts лежат
-- имя и телефон человека, который на сайт не заходил, согласия не давал и о
-- записи, скорее всего, не знает. Согласие даёт студент, а данные там
-- родительские — этой строчкой оно не покрывается.
--
-- Решено: стираем, а не обезличиваем. profiles.id каскадом привязан к
-- auth.users, и удаление учётной записи сносит профиль, контакты, снаряжение,
-- записи и отметки явки. История группы для клуба не настолько ценна, чтобы
-- ради неё спорить с человеком, который просит себя удалить. Цифры клуба на
-- лендинге считают походы, а не людей, и не пострадают.
-- ============================================================

create or replace function delete_account(p_user uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := auth.uid();
  v_target uuid := coalesce(p_user, auth.uid());
  v_hikes  uuid[];
  v_hike   uuid;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Своё удаляет кто угодно, чужое — только админ. Лидеру этого не дают:
  -- доступ к контактам своей группы не то же самое, что право стереть
  -- человека из клуба.
  if v_target <> v_actor and not is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- Ответственный за будущий поход не может просто исчезнуть: его уходом
  -- поход остался бы без хозяина, а группа — без того, кто меняет время
  -- сбора. Сперва передать ответственность.
  if exists (
    select 1 from hikes h
     where h.leader_id = v_target
       and h.starts_at > now()
       and h.status <> 'cancelled'
  ) then
    raise exception 'LEADS_FUTURE_HIKE';
  end if;

  -- Записи на будущие походы отменяем по-настоящему, а не удалением строки:
  -- место должно уйти первому из очереди, а счётчики сойтись. Каскад этого
  -- не умеет — он просто уносит строку, и место остаётся занятым мёртвой
  -- душой.
  for v_hike in
    select r.hike_id from registrations r
      join hikes h on h.id = r.hike_id
     where r.user_id = v_target
       and r.status <> 'cancelled'
       and h.starts_at > now()
  loop
    -- Со-лидера будущего похода сперва убираем из состава: его запись
    -- держится составом, и cancel_registration ответит LEADER_REGISTRATION.
    delete from hike_leaders where hike_id = v_hike and user_id = v_target;

    if exists (
      select 1 from registrations
       where hike_id = v_hike and user_id = v_target and status <> 'cancelled'
    ) then
      perform cancel_registration(v_hike, v_target);
    end if;
  end loop;

  -- Походы, где человек остаётся строкой, — их счётчики надо пересчитать
  -- после каскада. Собираем до удаления: потом этих строк уже нет.
  select coalesce(array_agg(distinct hike_id), '{}')
    into v_hikes
    from registrations where user_id = v_target;

  -- Каскад от auth.users: profiles, emergency_contacts, user_gear,
  -- registrations, attendance, hike_leaders.
  delete from auth.users where id = v_target;

  foreach v_hike in array v_hikes loop
    perform refresh_hike_counters(v_hike);
  end loop;
end;
$$;

-- ============================================================
-- СРОК ХРАНЕНИЯ — БЕЗ ПЛАНИРОВЩИКА
--
-- Автоматика требует pg_cron или задачи на Vercel, то есть нового
-- движущегося куска. Вместо этого — как везде на сайте: считает сайт,
-- нажимает человек. Вьюха отвечает, кого пора удалить; экран админа
-- показывает список и причину.
--
-- Двенадцать месяцев, потому что академический год с летними каникулами
-- должен помещаться внутрь: студент, сходивший в мае и вернувшийся в
-- сентябре, не должен обнаружить пустой профиль.
-- ============================================================

create or replace view stale_profiles
with (security_invoker = true) as
  select p.id,
         p.full_name,
         p.membership_status,
         p.created_at,
         (select max(h.starts_at)
            from registrations r join hikes h on h.id = r.hike_id
           where r.user_id = p.id and r.status <> 'cancelled') as last_hike_at,
         exists (select 1 from emergency_contacts ec where ec.user_id = p.id)
           as has_emergency_contact
    from profiles p
   where p.role = 'participant'
     and not exists (
       select 1 from registrations r
         join hikes h on h.id = r.hike_id
        where r.user_id = p.id
          and r.status <> 'cancelled'
          and h.starts_at > now() - interval '12 months'
     );

-- security_invoker = true намеренно, в отличие от витрин лендинга: здесь
-- строки персональные, и отдавать их должна политика profiles_select,
-- то есть только админу. Вьюха, обходящая RLS, светила бы весь клуб.
grant select on stale_profiles to authenticated;
