-- Фотографии: снимки походов и аватары.
--
-- Хранилище — Supabase Storage, а не Cloudflare R2, как было записано в
-- PROJECT.md. Решение про R2 принималось на бумаге, до кода, и не выдержало
-- встречи с ним: supabase-js уже в бандле, доступ к файлам описывается теми
-- же политиками, что и таблицы, а в «Доступах» README на один сервис меньше —
-- преемнику в 2027 не придётся получать ключи ещё и к Cloudflare. Объём у
-- Supabase меньше (1 ГБ против 10), но при пятнадцати снимках на поход это
-- лет пять, и десятикратный запас, которым не воспользуются, не стоит лишнего
-- сервиса в наследство.

-- ============================================================
-- БАКЕТЫ
--
-- Их два, потому что политики различаются принципиально: снимок похода
-- грузит лидер этого похода, аватар — человек только свой. Одним бакетом
-- это выразилось бы одной сложной политикой вместо двух простых.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('hike-photos', 'hike-photos', true),
       ('avatars',     'avatars',     true)
on conflict (id) do nothing;

-- ============================================================
-- ПОЛИТИКИ НА ФАЙЛЫ
--
-- Первый сегмент пути — владелец: hike-photos/{hike_id}/…,
-- avatars/{user_id}/…. Разбираем его через split_part, а не через
-- storage.foldername(): обычный SQL переживает и схемные тесты в PGlite, где
-- хелперов Supabase нет, и чтение человеком, который видит это впервые.
-- ============================================================

create policy hike_photos_read on storage.objects
  for select using (bucket_id = 'hike-photos');

create policy hike_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hike-photos'
    and is_hike_leader(split_part(name, '/', 1)::uuid)
  );

create policy hike_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hike-photos'
    and is_hike_leader(split_part(name, '/', 1)::uuid)
  );

create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

-- Только своё, без исключения для админа.
--
-- Сначала здесь стояло `or is_admin()` — под сценарий «лидеры присылают
-- портреты, загружает их один человек». Сценарий отпал: портрет лидера и
-- аватар — одно и то же поле, а страница профиля с загрузкой уже есть, так
-- что каждый ставит своё сам, и лишнего экрана для админа не нужно.
--
-- А для разовой уборки неудачного файла политика не нужна вовсе: служебная
-- роль обходит RLS, и из SQL-редактора это делается и так. Право в правилах
-- существовало бы ради интерфейса, которого нет.
create policy avatars_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

-- ============================================================
-- СНИМКИ ПОХОДА
--
-- Зачем таблица, если файлы и так лежат в бакете: нужен порядок снимков,
-- а вместе с ним — обложка. Отдельного поля «обложка» нет намеренно:
-- первый по sort_order и есть обложка, и лидер меняет её перетаскиванием,
-- а не отдельной кнопкой с отдельным состоянием.
-- ============================================================

create table hike_photos (
  id         uuid primary key default gen_random_uuid(),
  hike_id    uuid not null references hikes(id) on delete cascade,

  -- Путь в бакете, не полный адрес: домен проекта Supabase меняется при
  -- пересоздании, и зашитые в базу ссылки протухли бы все разом.
  path       text not null,
  thumb_path text not null,

  sort_order int  not null default 0,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index hike_photos_hike_idx on hike_photos (hike_id, sort_order);

alter table hike_photos enable row level security;

-- Видно тем же, кому виден сам поход: черновик лидера не должен светиться
-- фотографиями раньше времени.
create policy hike_photos_read on hike_photos
  for select using (
    exists (
      select 1 from hikes h
      where h.id = hike_id
        and (h.status in ('published','completed','cancelled') or is_staff())
    )
  );

create policy hike_photos_leader_insert on hike_photos
  for insert to authenticated
  with check (is_hike_leader(hike_id));

create policy hike_photos_leader_update on hike_photos
  for update to authenticated
  using (is_hike_leader(hike_id))
  with check (is_hike_leader(hike_id));

create policy hike_photos_leader_delete on hike_photos
  for delete to authenticated
  using (is_hike_leader(hike_id));

grant select on hike_photos to anon, authenticated;
grant insert, update, delete on hike_photos to authenticated;
