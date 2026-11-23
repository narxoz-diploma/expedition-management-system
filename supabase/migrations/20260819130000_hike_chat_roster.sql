-- Сборка чата похода: отметки «добавлен» и «отправил ссылку», плюс момент
-- подъёма из очереди.
--
-- ============================================================
-- ЗАЧЕМ ЭТО ВООБЩЕ ЕСТЬ
--
-- Чат под поход лидер заводит за день до выхода и наполняет вручную. Ссылки
-- на чат в схеме нет и не будет: ссылка-приглашение уходит по рукам, и в
-- чате оказывается кто угодно, а лидеру потом гадать, тот ли это человек.
-- Добавление по номеру из ростера подтверждает личность само — номер взят
-- из профиля того, кто записался.
--
-- Добавлять приходится по одному: WhatsApp при добавлении пачкой отбивает
-- всю пачку, если хотя бы у одного стоит запрет на добавление в группы, и
-- не говорит, у кого именно. Двадцать пять человек по одному за раз — это
-- работа на несколько заходов, и её надо где-то помнить между заходами.
-- Отсюда отметка на записи.
--
-- Два состояния, а не одно, потому что путей тоже два: добавили по номеру
-- или отправили ссылку в личку тому, кого добавить не дали. Второй ещё не
-- в чате, и про него нельзя забыть.
-- ============================================================

alter table registrations
  add column chat_status    text,
  add column chat_status_at timestamptz,
  -- Момент подъёма из очереди. Без него поднявшийся неотличим от того, кто
  -- сразу записался на свободное место: waitlist_pos при подъёме обнуляется.
  -- А разница для лидера решающая — поднявшийся не знает, что идёт:
  -- уведомлений в проекте нет и не будет, он узнает, только если сам зайдёт
  -- на сайт. Такому сперва пишут «идёшь?», и лишь потом добавляют в чат.
  add column promoted_at    timestamptz;

alter table registrations
  add constraint registrations_chat_status_known
  check (chat_status is null or chat_status in ('added', 'invited'));

comment on column registrations.chat_status is
  'added — добавлен в чат по номеру; invited — отправлена ссылка, ждём; null — не трогали';

-- ============================================================
-- КТО СТАВИТ ОТМЕТКУ
--
-- Через функцию, а не прямым update: прав на запись в registrations у
-- authenticated нет вовсе, и это единственная защита счётчика мест от
-- перебора. Расширять их ради галочки в чате незачем.
--
-- p_status = null снимает отметку. Возможность снять — не украшение: ровно
-- этого не хватало отметкам явки, и лидер, промахнувшийся по строке, не мог
-- вернуть «не отмечен» ничем.
-- ============================================================

create or replace function set_chat_status(
  p_hike_id uuid,
  p_user_id uuid,
  p_status  text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_hike_leader(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  if p_status is not null and p_status not in ('added', 'invited') then
    raise exception 'BAD_CHAT_STATUS';
  end if;

  update registrations
     set chat_status    = p_status,
         chat_status_at = case when p_status is null then null else now() end
   where hike_id = p_hike_id
     and user_id = p_user_id;

  -- Отменённую запись отмечать можно и нужно: человек остаётся в чате, пока
  -- лидер его оттуда не уберёт, и снятая отметка — это как раз «убрал».
  if not found then
    raise exception 'NOT_REGISTERED';
  end if;
end;
$$;

-- ============================================================
-- ОТКУДА БЕРЁТСЯ promoted_at
--
-- Единственное место в схеме, где кто-то переходит из очереди в состав.
-- Сюда же приходят и отмена записи, и появление нового лидера — поэтому
-- отметка ставится здесь, а не в cancel_registration: иначе половина
-- подъёмов осталась бы неотмеченной.
-- ============================================================

create or replace function promote_from_waitlist(p_hike_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hike     hikes%rowtype;
  v_taken    int;
  v_promoted uuid;
begin
  select * into v_hike from hikes where id = p_hike_id;
  if not found then return null; end if;

  select count(*) into v_taken
  from registrations
  where hike_id = p_hike_id and status = 'confirmed' and not as_leader;

  if v_taken >= v_hike.capacity then return null; end if;

  select user_id into v_promoted
  from registrations
  where hike_id = p_hike_id and status = 'waitlist'
  order by waitlist_pos nulls last, created_at
  limit 1;

  if v_promoted is not null then
    update registrations
       set status       = 'confirmed',
           waitlist_pos = null,
           promoted_at  = now()
     where hike_id = p_hike_id and user_id = v_promoted and status = 'waitlist';
  end if;

  perform resequence_waitlist(p_hike_id);
  return v_promoted;
end;
$$;
revoke all on function promote_from_waitlist(uuid) from public, anon, authenticated;
