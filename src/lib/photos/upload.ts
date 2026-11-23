/**
 * Загрузка снимков в хранилище — из браузера, минуя сервер.
 *
 * Файл идёт прямо в Supabase Storage: пропускать 5 МБ через server action
 * значит гнать их дважды и упереться в лимит тела запроса на Vercel. Права
 * при этом не ослаблены — их проверяет политика на storage.objects, а она
 * стоит ближе к данным, чем любая проверка в коде.
 *
 * Строку в `hike_photos` пишет server action: по правилу 5 из CLAUDE.md
 * мутации идут через сервер с проверкой роли.
 */

import { createClient } from "@/lib/supabase/client";

import { AVATARS_BUCKET, HIKE_PHOTOS_BUCKET, avatarPath, hikePhotoPaths } from "./paths";
import { resizeAvatar, resizePhoto } from "./resize";
import { isTooSmallForCover } from "./sizes";

export type UploadedPhoto = { path: string; thumbPath: string };

/** Что сейчас происходит с конкретным файлом — для полосы прогресса. */
export type UploadProgress = {
  index: number;
  total: number;
  fileName: string;
  stage: "resize" | "upload" | "done" | "failed";
};

/**
 * Сжимает и загружает файлы по одному.
 *
 * По одному, а не пачкой: десяток параллельных загрузок с телефона забивает
 * канал и заканчивается таймаутами, а показать честный прогресс становится
 * нечем.
 *
 * Упавший файл не роняет остальные — на телефоне обрыв связи на седьмом
 * снимке из пятнадцати штатная ситуация, и терять шесть загруженных из-за
 * него нельзя. Список неудачных возвращается наверх.
 */
export async function uploadHikePhotos(
  hikeId: string,
  files: File[],
  onProgress?: (p: UploadProgress) => void,
): Promise<{ uploaded: UploadedPhoto[]; failed: string[]; small: string[] }> {
  const supabase = createClient();
  const uploaded: UploadedPhoto[] = [];
  const failed: string[] = [];

  // Мелкие не отклоняем — в плитке галереи они смотрятся нормально, — но
  // называем: во всю ширину карточки такой кадр размыт, и лидер должен
  // узнать об этом сейчас, а не увидеть потом на витрине.
  const small: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const report = (stage: UploadProgress["stage"]) =>
      onProgress?.({ index, total: files.length, fileName: file.name, stage });

    try {
      report("resize");
      const { full, thumb, width } = await resizePhoto(file);
      if (isTooSmallForCover(width)) small.push(file.name);

      report("upload");
      const { path, thumbPath } = hikePhotoPaths(hikeId, crypto.randomUUID());
      const bucket = supabase.storage.from(HIKE_PHOTOS_BUCKET);

      const [a, b] = await Promise.all([
        bucket.upload(path, full, { contentType: "image/jpeg" }),
        bucket.upload(thumbPath, thumb, { contentType: "image/jpeg" }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;

      uploaded.push({ path, thumbPath });
      report("done");
    } catch (error) {
      // В лог — подробности, наверх — только имя файла: человеку нужно
      // знать, что перезалить, а не текст ошибки хранилища.
      console.error(`Не удалось загрузить ${file.name}`, error);
      failed.push(file.name);
      report("failed");
    }
  }

  return { uploaded, failed, small };
}

/**
 * Аватар: сжать в квадрат и загрузить. Возвращает путь в бакете.
 *
 * Отдельно от снимков похода, потому что политика другая — писать можно
 * только в свою папку, — но сжатие и загрузка те же.
 */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<string> {
  const blob = await resizeAvatar(file);
  const path = avatarPath(userId, crypto.randomUUID());

  const { error } = await createClient()
    .storage.from(AVATARS_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });

  if (error) throw error;
  return path;
}
