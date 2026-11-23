-- Удаление черновика похода.
--
-- Решение автора 14 сентября 2026. Черновик нельзя было удалить ничем, и
-- автор не создавал тестовых походов вовсе, чтобы не плодить то, что потом не
-- убрать: на проде до сих пор висят черновики, созданные на пробу.
--
-- Функцией, а не политикой delete на hikes: прямого права удалять поход у
-- лидера не появляется, а все условия проверяются в одном месте и под одной
-- блокировкой строки. Условия:
--
--   * автор похода или админ — is_hike_responsible(); второй лидер, идущий
--     на поход, черновик не удаляет, как не удаляет его и из состава;
--   * только черновик: опубликованный видели люди, отменённый и прошедший —
--     история клуба;
--   * ни одной записи участника в любом статусе, включая отменённые:
--     черновиком бывает и снятый с публикации поход, на который уже
--     записывались, и такие записи — чья-то история;
--   * ни одной фотографии: снимки лежат в Storage, каскад по таблице их
--     оттуда не уберёт, и файлы остались бы сиротами без владельца.
--
-- Записи лидеров, состав и отметки уходят каскадом (on delete cascade).
-- Применять можно когда угодно: функция новая, код её вызывает только после
-- выкатки.

create or replace function delete_draft_hike(p_hike_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not is_hike_responsible(p_hike_id) then
    raise exception 'FORBIDDEN';
  end if;

  select status::text into v_status from hikes where id = p_hike_id for update;
  if not found then
    raise exception 'HIKE_NOT_FOUND';
  end if;

  if v_status <> 'draft' then
    raise exception 'NOT_A_DRAFT';
  end if;

  if exists (
    select 1 from registrations
     where hike_id = p_hike_id and not as_leader
  ) then
    raise exception 'DRAFT_HAS_REGISTRATIONS';
  end if;

  if exists (select 1 from hike_photos where hike_id = p_hike_id) then
    raise exception 'DRAFT_HAS_PHOTOS';
  end if;

  delete from hikes where id = p_hike_id;
end;
$$;

revoke all on function delete_draft_hike(uuid) from public, anon;
grant execute on function delete_draft_hike(uuid) to authenticated;
