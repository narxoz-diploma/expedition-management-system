-- ============================================================
-- КОД СЕМЕСТРА НЕ СПИСЫВАЕТСЯ ВПУСТУЮ
--
-- Было: `update invite_codes set uses = uses + 1` стоял безусловно, а
-- повышение статуса ниже — только `where membership_status in
-- ('guest','pending')`. То есть участник, вставивший код второй раз, тратил
-- использование, не получив ничего: статус у него уже нужный.
--
-- Почему это важно именно сейчас. До набора код лежал у нескольких человек,
-- и промахнуться было негде. Код на набор публикуется в группе, и у него
-- будет max_uses — иначе он живёт вечно и утекает вместе со скриншотом. При
-- живом max_uses любопытный повтор («сработало ли?») отнимает место у того,
-- кто ещё не вступил, и код кончается раньше людей. Причём молча: тому, кто
-- повторил, всё равно отвечают «Готово, ты участник клуба».
--
-- Стало: сначала статус, и только если он действительно изменился —
-- списание. Порядок именно такой, а не «списать и откатить»: строка кода
-- уже взята `for update`, и лишнее движение по ней ничего не упрощает.
-- ============================================================

create or replace function redeem_invite_code(p_code text)
returns membership_status
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_code invite_codes%rowtype;
  v_result membership_status;
  v_promoted int;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_code from invite_codes
  where lower(code) = lower(trim(p_code)) for update;

  if not found then raise exception 'INVALID_CODE'; end if;
  if v_code.expires_at is not null and now() > v_code.expires_at then
    raise exception 'CODE_EXPIRED';
  end if;
  if v_code.max_uses is not null and v_code.uses >= v_code.max_uses then
    raise exception 'CODE_EXHAUSTED';
  end if;

  perform set_config('app.trusted_write', 'on', true);
  update profiles
     set membership_status = 'member',
         joined_at = coalesce(joined_at, now()),
         verification_method = 'invite_code'
   where id = v_user and membership_status in ('guest','pending');
  get diagnostics v_promoted = row_count;
  perform set_config('app.trusted_write', 'off', true);

  -- Списываем, только если код кого-то провёл. Ноль строк здесь — это не
  -- сбой: чаще всего человек уже участник и просто вставил код повторно.
  if v_promoted > 0 then
    update invite_codes set uses = uses + 1 where id = v_code.id;
  end if;

  select membership_status into v_result from profiles where id = v_user;
  return v_result;
end;
$$;
