-- Справочник клуба для лидеров и отметка «в общем чате».
--
-- ============================================================
-- ЗАЧЕМ ВЬЮХА, А НЕ РАСШИРЕНИЕ ПОЛИТИКИ
--
-- Лидер сегодня видит гостей, заявки и людей, записанных на его походы, —
-- клуб целиком не видит никто, кроме админа. Это не упущение, а действующая
-- граница, и справочник её сдвигает.
--
-- Сдвинуть можно двумя способами. Расширить profiles_select до is_staff() —
-- тогда лидеру открывается вся строка профиля, включая дату рождения, и
-- закрывать лишнее пришлось бы поколоночными грантами: тот самый механизм,
-- на котором уже обжигались с местом сбора (новая колонка не читается, пока
-- ей явно не выдадут select).
--
-- Здесь — вьюха с явным списком колонок и условием is_staff() внутри.
-- Граница видна в одном месте целиком, а не собирается из политики, грантов
-- и кода. Экстренные контакты в список не входят вовсе: они не «закрыты
-- политикой», а физически недоступны через эту дверь. Это данные родителей,
-- и справочником они быть не должны.
--
-- Дата рождения не входит по той же причине: в справочнике она не нужна, а
-- возраст своей группы лидер видит в ростере.
--
-- Телефон входит — решение автора: лидеры и так видят номера всех в общем
-- чате WhatsApp, и прятать цифры на сайте значило бы изображать защиту,
-- которой нет.
-- ============================================================

-- ============================================================
-- ОТМЕТКА «В ОБЩЕМ ЧАТЕ»
--
-- Одна на человека навсегда, а не на поход: в общий чат клуба добавляют один
-- раз в жизни. Значения те же, что у чата похода, и по той же причине —
-- механика WhatsApp не меняется от того, какой это чат: добавлять по одному,
-- а кого не дали добавить, тому ссылку в личку.
--
-- added — человек в чате, неважно, добавили его по номеру или он зашёл сам.
-- invited — ссылку отправили, но в чате его ещё нет.
-- ============================================================

alter table profiles
  add column club_chat_status    text,
  add column club_chat_status_at timestamptz;

alter table profiles
  add constraint profiles_club_chat_status_known
  check (club_chat_status is null or club_chat_status in ('added', 'invited'));

comment on column profiles.club_chat_status is
  'added — в общем чате клуба; invited — отправлена ссылка, ждём; null — не трогали';

create or replace function set_club_chat_status(p_user uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'FORBIDDEN';
  end if;

  if p_status is not null and p_status not in ('added', 'invited') then
    raise exception 'BAD_CHAT_STATUS';
  end if;

  -- Через функцию, а не прямым update: писать в чужой профиль обычному
  -- клиенту нельзя вовсе, и открывать ради галочки целую колонку незачем.
  -- Триггер guard_profile_privileges тут не мешает — роль, членство и
  -- счётчики не трогаются.
  update profiles
     set club_chat_status    = p_status,
         club_chat_status_at = case when p_status is null then null else now() end
   where id = p_user;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
end;
$$;

-- ============================================================
-- СПРАВОЧНИК
-- ============================================================

create view club_directory
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
         (select count(*) from attendance a
           where a.user_id = p.id and a.result = 'completed')::int as hikes_completed,
         -- Последний поход считается по записи, а не по отметке явки:
         -- «не ходил с марта» должно быть правдой и для похода, где лидер
         -- явку проставить забыл.
         (select max(h.starts_at)
            from registrations r join hikes h on h.id = r.hike_id
           where r.user_id = p.id
             and r.status <> 'cancelled'
             and h.starts_at < now()) as last_hike_at
    from profiles p
   -- Условие внутри вьюхи, а не в политике: вьюха обходит RLS, и без него
   -- она отдала бы клуб целиком любому вошедшему.
   where is_staff();

revoke all on club_directory from anon;
grant select on club_directory to authenticated;
