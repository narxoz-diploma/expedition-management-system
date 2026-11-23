-- Справочник: лидеру засчитываются походы, которые он вёл.
--
-- «походов: N» считался по отметкам явки «Пройден», а лидеров на экране явки
-- нет вовсе — их присутствие подтверждено тем, что они ведут. Поэтому у
-- лидера счётчик навсегда застывал на походах, куда он ходил участником:
-- автор заметил, что у участников число растёт, а у лидеров нет (22 сентября
-- 2026).
--
-- Теперь hikes_completed — все походы человека: пройденные участником и
-- проведённые лидером, без двойного счёта одного похода. hikes_led — сколько
-- из них он вёл; экран пишет «походов: 8, из них вёл 5».
--
-- Проведённый — тот, что уже начался и не отменён, а человек записан на него
-- лидером (запись лидера создаёт состав похода, см. hike_leaders). Итог
-- «Пройден» лидеру никто не ставит, так что другого признака нет.
--
-- create or replace view может только добавлять колонки в конец, поэтому
-- hikes_led стоит последней, а late_cancel_count остаётся, хотя экран его
-- больше не читает. Миграция только меняет вьюху, её можно применять раньше
-- кода.

create or replace view club_directory
with (security_invoker = false) as
  select p.id,
         p.full_name,
         p.membership_status,
         p.study_year,
         p.phone,
         p.fitness_level,
         p.visited_places,
         p.late_cancel_count,
         p.no_show_count,
         p.club_chat_status,
         p.club_chat_status_at,
         (select count(*) from (
            select a.hike_id from attendance a
             where a.user_id = p.id and a.result = 'completed'
            union
            select r.hike_id from registrations r join hikes h on h.id = r.hike_id
             where r.user_id = p.id and r.as_leader and r.status <> 'cancelled'
               and h.status in ('published', 'completed') and h.starts_at < now()
          ) done)::int as hikes_completed,
         -- Последний поход считается по записи, а не по отметке явки:
         -- «не ходил с марта» должно быть правдой и для похода, где лидер
         -- явку проставить забыл.
         (select max(h.starts_at)
            from registrations r join hikes h on h.id = r.hike_id
           where r.user_id = p.id
             and r.status <> 'cancelled'
             and h.starts_at < now()) as last_hike_at,
         (select count(*) from registrations r join hikes h on h.id = r.hike_id
           where r.user_id = p.id and r.as_leader and r.status <> 'cancelled'
             and h.status in ('published', 'completed') and h.starts_at < now()
         )::int as hikes_led
    from profiles p
   -- Условие внутри вьюхи, а не в политике: вьюха обходит RLS, и без него
   -- она отдала бы клуб целиком любому вошедшему.
   where is_staff();
