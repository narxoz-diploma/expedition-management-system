"use server";

import { updateTag } from "next/cache";

import { LANDING_PHOTOS_TAG } from "@/lib/cache-tags";

import { canEditHikeNow, requireStaff } from "@/lib/auth-guards";
import { getHikeById } from "@/lib/hikes/queries";
import { HIKE_PHOTOS_BUCKET } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";
import { revalidateLocalized } from "@/lib/i18n/server";

export type PhotoActionState = { message?: string; ok?: boolean };

/**
 * Файлы уже в хранилище — сюда приходят только пути.
 *
 * Сами снимки грузятся из браузера прямо в Storage: гнать 5 МБ через server
 * action значит везти их дважды и упереться в лимит тела запроса. Права на
 * файлы стережёт политика на storage.objects, права на строки — эта
 * проверка. Правило 5 из CLAUDE.md соблюдено: мутация идёт через сервер.
 */
export async function addHikePhotos(
  hikeId: string,
  photos: { path: string; thumbPath: string }[],
): Promise<PhotoActionState> {
  if (photos.length === 0) return { ok: true };

  const profile = await requireStaff();
  const hike = await getHikeById(hikeId);
  if (!hike) return { message: "Поход не найден" };
  if (!(await canEditHikeNow(profile, hike))) {
    return { message: "Это чужой поход — фотографии добавляет его лидер" };
  }

  const supabase = await createClient();

  // Новые снимки встают в конец: порядок задаёт обложку, и загрузка не
  // должна незаметно менять ту, что лидер уже выбрал.
  const { data: last } = await supabase
    .from("hike_photos")
    .select("sort_order")
    .eq("hike_id", hikeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const from = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("hike_photos").insert(
    photos.map((photo, i) => ({
      hike_id: hikeId,
      path: photo.path,
      thumb_path: photo.thumbPath,
      sort_order: from + i,
      uploaded_by: profile.id,
    })),
  );

  if (error) {
    console.error("Не удалось записать снимки похода", error);
    return { message: "Снимки загрузились, но не записались. Обнови страницу" };
  }

  refreshPhotoViews(hike.slug);
  return { ok: true };
}

/**
 * Удаление: сперва строка, потом файлы.
 *
 * Обратный порядок оставил бы при отказе строку, ссылающуюся в пустоту, —
 * то есть битую картинку на странице похода. Осиротевший файл в хранилище
 * не видит никто, и стоит он копейки.
 */
export async function deleteHikePhoto(
  photoId: string,
): Promise<PhotoActionState> {
  const profile = await requireStaff();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("hike_photos")
    .select("id, hike_id, path, thumb_path")
    .eq("id", photoId)
    .maybeSingle();

  if (!photo) return { message: "Снимок не найден" };

  const hike = await getHikeById(photo.hike_id);
  if (!hike) return { message: "Поход не найден" };
  if (!(await canEditHikeNow(profile, hike))) {
    return { message: "Это чужой поход — фотографии удаляет его лидер" };
  }

  const { error } = await supabase.from("hike_photos").delete().eq("id", photoId);
  if (error) {
    console.error("Не удалось удалить снимок", error);
    return { message: "Не получилось удалить снимок" };
  }

  const { error: storageError } = await supabase.storage
    .from(HIKE_PHOTOS_BUCKET)
    .remove([photo.path, photo.thumb_path]);
  if (storageError) {
    // Не сообщаем: со страницы снимок уже исчез, а мусор в хранилище —
    // забота уборки, а не человека с телефоном в руках.
    console.error("Строка удалена, файлы остались", storageError);
  }

  refreshPhotoViews(hike.slug);
  return { ok: true };
}

/** Порядок снимков целиком: первый по порядку — обложка похода. */
export async function reorderHikePhotos(
  hikeId: string,
  photoIds: string[],
): Promise<PhotoActionState> {
  const profile = await requireStaff();
  const hike = await getHikeById(hikeId);
  if (!hike) return { message: "Поход не найден" };
  if (!(await canEditHikeNow(profile, hike))) {
    return { message: "Это чужой поход — порядок меняет его лидер" };
  }

  const supabase = await createClient();

  // По одному запросу на снимок: их полтора десятка, а batch upsert
  // потребовал бы слать все колонки строки целиком и рисковать затереть то,
  // чего мы не читали.
  for (let i = 0; i < photoIds.length; i += 1) {
    const { error } = await supabase
      .from("hike_photos")
      .update({ sort_order: i })
      .eq("id", photoIds[i])
      .eq("hike_id", hikeId);

    if (error) {
      console.error("Не удалось поменять порядок снимков", error);
      return { message: "Не получилось сохранить порядок" };
    }
  }

  refreshPhotoViews(hike.slug);
  return { ok: true };
}

function refreshPhotoViews(slug: string) {
  revalidateLocalized(`/hikes/${slug}`);
  revalidateLocalized("/hikes");
  revalidateLocalized("/");
  // Одного revalidateLocalized("/") мало: герой и галерея считаются не в рендере
  // страницы, а в своём кэше, общем на всех гостей, и сброс страницы их не
  // трогает. Без метки лидер поменял бы кадр и целый час видел старый.
  updateTag(LANDING_PHOTOS_TAG);
}

/**
 * Отметка «на главную».
 *
 * Ставится на экране похода, а не в отдельной админке: лидер и так
 * разбирает там снимки, а заводить ради одного флага ещё один экран —
 * значит завести ещё одно место, куда никто не заходит.
 */
export async function setPhotoFeatured(
  photoId: string,
  featured: boolean,
): Promise<PhotoActionState> {
  const profile = await requireStaff();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("hike_photos")
    .select("id, hike_id")
    .eq("id", photoId)
    .maybeSingle();

  if (!photo) return { message: "Снимок не найден" };

  const hike = await getHikeById(photo.hike_id);
  if (!hike) return { message: "Поход не найден" };
  if (!(await canEditHikeNow(profile, hike))) {
    return { message: "Это чужой поход — снимки отмечает его лидер" };
  }

  const { error } = await supabase
    .from("hike_photos")
    .update({ featured })
    .eq("id", photoId);

  if (error) {
    console.error("Не удалось отметить снимок", error);
    return { message: "Не получилось сохранить отметку" };
  }

  refreshPhotoViews(hike.slug);
  return { ok: true };
}
