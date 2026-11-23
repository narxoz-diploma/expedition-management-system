-- ============================================================
-- СНИМАЕМ ПОЛИТИКИ С ПРЕЖНЕГО БАКЕТА РАСПИСОК
--
-- Отдельным файлом от 20260829130000, где они стояли сначала: вместе с
-- `alter table hikes` они дали дедлок на живой базе. Одна транзакция бралась
-- за `storage.objects` и `hikes` разом, встречный процесс — в обратном
-- порядке. Здесь только `storage.objects`, брать вторую таблицу этому файлу
-- не за чем.
--
-- Сам бакет `waivers` остаётся: `delete from storage.buckets` Supabase
-- запрещает триггером `storage.protect_delete()` — «Direct deletion from
-- storage tables is not allowed. Use the Storage API instead». Проверено
-- запуском 29 августа; схемные тесты этого не видят, потому что в заглушке
-- PGlite `storage.buckets` обычная таблица без триггеров.
--
-- Без политик бакет недоступен никому и ничего не стоит. Если он мешает —
-- удалить руками в панели Supabase, раздел Storage.
-- ============================================================

drop policy if exists waivers_read on storage.objects;
drop policy if exists waivers_write on storage.objects;
drop policy if exists waivers_delete on storage.objects;
