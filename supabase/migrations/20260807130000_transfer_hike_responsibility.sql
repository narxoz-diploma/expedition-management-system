-- ============================================================
-- ПЕРЕДАЧА ОТВЕТСТВЕННОСТИ ЗА ПОХОД
--
-- До сих пор leader_id проставлялся при создании и не менялся нигде: в форме
-- поля нет, saveHike его не трогает, а remove_hike_leader намеренно не даёт
-- убрать ответственного. Отсюда три тупика: создал и не могу пойти; создал,
-- чтобы повёл другой; ответственный ушёл из клуба — и поход стал неправимым
-- для всех, кроме админа.
--
-- Передаём, а не «убираем себя»: ответственный должен быть всегда и ровно
-- один. На нём права на правку, состав и доступ к экстренным контактам, и
-- группа не должна остаться без человека, с которого спрос.
-- ============================================================

-- ------------------------------------------------------------
-- СНАЧАЛА ДЫРА
--
-- hikes_leader_update разрешает UPDATE любому из состава и поля leader_id не
-- защищает. В интерфейсе такой возможности не было, но anon key лежит в
-- клиентском бандле, и второй лидер мог переписать leader_id на себя прямым
-- запросом — то есть тихо угнать поход вместе с доступом к экстренным
-- контактам всей группы.
--
-- Политикой это не чинится: WITH CHECK не видит OLD, и «колонка не менялась»
-- в ней не выразить. Поэтому триггер.
--
-- Порядок с hikes_set_updated_at роли не играет, хотя по алфавиту guard и
-- идёт раньше: исключение отменяет весь оператор целиком.
-- ------------------------------------------------------------

create or replace function guard_hike_responsible()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Сменить ответственного может только он сам и админ. Проверяется старое
  -- значение, а не новое: вопрос в том, кто отдаёт, а не кому.
  if new.leader_id is distinct from old.leader_id
     and not (old.leader_id = auth.uid() or is_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger hikes_guard_responsible
  before update on hikes
  for each row execute function guard_hike_responsible();

revoke all on function guard_hike_responsible() from public, anon, authenticated;

-- ------------------------------------------------------------
-- САМА ПЕРЕДАЧА
-- ------------------------------------------------------------

create or replace function transfer_hike_responsibility(
  p_hike_id uuid,
  p_user_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_current uuid;
begin
  select leader_id into v_current from hikes where id = p_hike_id;
  if v_current is null then
    raise exception 'HIKE_NOT_FOUND';
  end if;

  -- Та же проверка, что в триггере. Здесь она нужна ради внятного кода
  -- ошибки: из триггера человек получил бы отказ уже после половины работы.
  if not (v_current = auth.uid() or is_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id = v_current then
    raise exception 'ALREADY_RESPONSIBLE';
  end if;

  if not exists (
    select 1 from profiles
    where id = p_user_id and role in ('leader', 'admin')
  ) then
    raise exception 'NOT_A_LEADER';
  end if;

  -- Получателя может не быть в составе. Добавляем: отвечать за поход, не имея
  -- доступа к экстренным контактам своей же группы, бессмысленно. Триггер
  -- hike_leaders_registration заведёт ему запись на поход сам, местом
  -- участника она не станет.
  insert into hike_leaders (hike_id, user_id, added_by)
  values (p_hike_id, p_user_id, auth.uid())
  on conflict do nothing;

  -- Прежний ответственный остаётся в составе обычным лидером. Убрать себя он
  -- сможет кнопкой, которая уже есть и уже освобождает его запись, — но это
  -- отдельное решение, и принимать его за него нельзя: чаще всего он идёт.
  update hikes set leader_id = p_user_id where id = p_hike_id;
end;
$$;

comment on function transfer_hike_responsibility(uuid, uuid) is
  'Передаёт ответственность за поход другому лидеру. Только сам ответственный или админ.';

-- ------------------------------------------------------------
-- УЙТИ ПОСЛЕ ПЕРЕДАЧИ
--
-- Без этого передача закрывает тупик «создал и не могу пойти» только
-- наполовину: отдав ответственность, человек остаётся в составе обычным
-- лидером, а remove_hike_leader требует is_hike_responsible — которым он уже
-- не является. Пришлось бы просить нового ответственного «убери меня».
--
-- Поэтому одно исключение: снять с похода самого себя может любой из состава.
-- Ответственного оно не касается — на нём проверка ниже, и уйти он может
-- только передав ответственность.
-- ------------------------------------------------------------

create or replace function remove_hike_leader(p_hike_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_hike_responsible(p_hike_id) or p_user_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  -- Ответственного из состава не убрать: он всё равно отвечает за поход,
  -- и оставить группу без единого лидера с доступом к контактам нельзя.
  if exists (select 1 from hikes where id = p_hike_id and leader_id = p_user_id) then
    raise exception 'CANNOT_REMOVE_RESPONSIBLE';
  end if;

  delete from hike_leaders where hike_id = p_hike_id and user_id = p_user_id;
end;
$$;
