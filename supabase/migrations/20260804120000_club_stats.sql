-- Публичные цифры клуба для лендинга.
--
-- Зачем отдельная витрина: блок «цифры» на лендинге — доказательство, что клуб
-- живой, и его видит аноним. Но собрать эти числа ему не из чего: profiles
-- закрыты политиками целиком, attendance — тоже. Отдавать ради этого таблицы
-- наружу нельзя, поэтому наружу идут только агрегаты.
--
-- security_invoker = false намеренно, как и у public_leaders: вьюха выполняется
-- с правами владельца и обходит RLS. Здесь это безопасно ровно потому, что
-- строк она не отдаёт — только четыре числа по клубу целиком.

create view public_club_stats
with (security_invoker = false) as
  select
    (select count(*)
       from hikes
      where status = 'completed'
         or (status = 'published' and starts_at < now()))::int as hikes_completed,

    (select count(*)
       from profiles
      where membership_status in ('member', 'alumni'))::int as members_count,

    -- Набор высоты по проведённым маршрутам, а не по людям: «клуб набрал
    -- столько-то» честнее, чем сумма по участникам, которая раздувается
    -- от численности группы.
    (select coalesce(sum(elevation_gain_m), 0)
       from hikes
      where status = 'completed'
         or (status = 'published' and starts_at < now()))::int as total_elevation_m,

    (select count(distinct coalesce(route_name, title))
       from hikes
      where status = 'completed'
         or (status = 'published' and starts_at < now()))::int as routes_count;

grant select on public_club_stats to anon, authenticated;
