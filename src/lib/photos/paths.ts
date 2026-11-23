/**
 * Пути к файлам в хранилище.
 *
 * Форма пути — не вкусовщина, а часть защиты. Политика на storage.objects
 * разбирает первый сегмент как владельца:
 *
 *   split_part(name, '/', 1)::uuid = id похода   (hike-photos)
 *   split_part(name, '/', 1)::uuid = auth.uid()  (avatars)
 *
 * Поменять форму пути — молча сломать загрузку: она начнёт отбиваться
 * невнятной ошибкой прав. Отсюда и тесты рядом.
 *
 * Модуль без импортов приложения — чтобы `node --test` его переварил.
 */

export const HIKE_PHOTOS_BUCKET = "hike-photos";
export const AVATARS_BUCKET = "avatars";


/**
 * Имя файла — новое на каждую загрузку, без перезаписи.
 *
 * Перезапись по одному адресу выглядела бы аккуратнее, но адрес попадает в
 * кэш браузера и CDN: человек меняет аватар и продолжает видеть старый,
 * иногда сутками. Новое имя снимает вопрос целиком, а старый файл удаляется
 * отдельно — это дешевле, чем объяснять людям, что надо «обновить страницу».
 */
export function hikePhotoPaths(
  hikeId: string,
  fileId: string,
): { path: string; thumbPath: string } {
  return {
    path: `${hikeId}/${fileId}.jpg`,
    thumbPath: `${hikeId}/${fileId}-thumb.jpg`,
  };
}

export function avatarPath(userId: string, fileId: string): string {
  return `${userId}/${fileId}.jpg`;
}

/**
 * Путь внутри бакета аватаров, вынутый обратно из адреса, — или null, если
 * адрес чужой.
 *
 * Нужен, чтобы удалить прежний файл при замене аватара. Чужие адреса
 * возвращают null намеренно: у большинства в `avatar_url` лежит ссылка на
 * `lh3.googleusercontent.com`, и пытаться удалить «файл» по ней — в лучшем
 * случае бессмысленный запрос.
 */
export function avatarPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${AVATARS_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const path = url.slice(at + marker.length);
  return path === "" ? null : path;
}

/** Публичный адрес файла. Бакеты открыты на чтение, подписи не нужны. */
export function publicUrl(
  supabaseUrl: string,
  bucket: string,
  path: string,
): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}
