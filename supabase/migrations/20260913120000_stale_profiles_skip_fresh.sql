-- Срок хранения: свежий профиль без походов — не просроченный.
--
-- Вьюха отбирала всех, у кого за двенадцать месяцев не было похода, и не
-- смотрела, сколько живёт сам профиль. Человек, зарегистрировавшийся на
-- наборе 31 августа и ещё никуда не сходивший, попадал в «Пора стереть»
-- с первого же дня — вместе со всем набором: 13 сентября 2026 экран показал
-- 252 человека, почти весь клуб, с кнопкой «Удалить данные» у каждого.
--
-- Согласие обещает хранить данные год после последнего похода. У того, кто
-- не ходил ни разу, отсчёт идёт от регистрации — иначе год ему не
-- достаётся вовсе.
--
-- Колонки те же и в том же порядке: create or replace view не даёт их
-- менять, а экран /admin/data читает их поимённо. Применять можно когда
-- угодно — до выкатки кода и после, код эта правка не трогает.

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
     and p.created_at < now() - interval '12 months'
     and not exists (
       select 1 from registrations r
         join hikes h on h.id = r.hike_id
        where r.user_id = p.id
          and r.status <> 'cancelled'
          and h.starts_at > now() - interval '12 months'
     );

grant select on stale_profiles to authenticated;
