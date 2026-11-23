import { unstable_cache } from "next/cache";
import { cache } from "react";

import { LANDING_PHOTOS_TAG } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/env";

import { HIKE_PHOTOS_BUCKET, publicUrl } from "./paths";

export type HikePhoto = {
  id: string;
  url: string;
  thumbUrl: string;
  /** Отмечен «на главную». Нужен только экрану лидера. */
  featured: boolean;
};

type PhotoRow = {
  id: string;
  path: string;
  thumb_path: string;
  featured?: boolean;
};

/**
 * Адреса собираются здесь, а не хранятся в базе.
 *
 * В базе лежит путь внутри бакета: домен проекта Supabase меняется при
 * пересоздании, и зашитые полные ссылки протухли бы все разом, причём
 * молча — вместо фотографий остались бы битые картинки.
 */
function toPhoto(row: PhotoRow): HikePhoto {
  const base = supabaseUrl();
  return {
    id: row.id,
    url: publicUrl(base, HIKE_PHOTOS_BUCKET, row.path),
    thumbUrl: publicUrl(base, HIKE_PHOTOS_BUCKET, row.thumb_path),
    featured: row.featured ?? false,
  };
}

/** Снимки похода по порядку: первый — обложка. */
export const listHikePhotos = cache(async function listHikePhotos(
  hikeId: string,
): Promise<HikePhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hike_photos")
    .select("id, path, thumb_path, featured")
    .eq("hike_id", hikeId)
    .order("sort_order", { ascending: true })
    .returns<PhotoRow[]>();

  if (error) {
    console.error("Не удалось получить снимки похода", error);
    return [];
  }
  return data.map(toPhoto);
});

/**
 * Снимок для героя лендинга — обложка последнего состоявшегося похода.
 *
 * Отдельного «выбери фото для главной» нет намеренно: это ещё один экран и
 * ещё одно состояние, которое кто-то должен помнить обновлять. Обложку
 * лидер и так выбирает у себя на походе, а главная показывает последнее —
 * не нравится кадр, лидер меняет обложку, и главная меняется следом.
 */
/**
 * Обложки сразу для списка походов: id похода → первый снимок.
 *
 * Одним запросом на всю страницу, а не по одному на карточку: двадцать
 * походов дали бы двадцать походов в базу, и список открывался бы заметно
 * дольше ради картинок. Первый по sort_order и есть обложка — отдельного
 * поля под неё нет, порядок задаёт лидер перетаскиванием.
 */
export const listHikeCovers = cache(async function listHikeCovers(
  hikeIds: string[],
): Promise<Map<string, HikePhoto>> {
  const covers = new Map<string, HikePhoto>();
  if (hikeIds.length === 0) return covers;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hike_photos")
    .select("id, hike_id, path, thumb_path")
    .in("hike_id", hikeIds)
    .order("sort_order", { ascending: true })
    .returns<(PhotoRow & { hike_id: string })[]>();

  if (error) {
    console.error("Не удалось получить обложки походов", error);
    return covers;
  }

  // Строки идут по возрастанию sort_order, поэтому первая встреченная для
  // похода и есть обложка — остальные пропускаем.
  for (const row of data) {
    if (!covers.has(row.hike_id)) covers.set(row.hike_id, toPhoto(row));
  }
  return covers;
});

/** Сколько кадров сменяется в герое. Больше никто не досмотрит. */
const HERO_LIMIT = 5;

/**
 * Час: кадры на главной и в галерее меняют раз в сезон, а любая правка
 * альбома сбрасывает кэш меткой сразу. Число тут — страховка на случай,
 * когда сбросить забыли, а не рабочий срок годности.
 */
const PHOTOS_TTL_SECONDS = 3600;

/**
 * Кадры для героя лендинга: отмеченные лидерами «на главную».
 *
 * Если не отмечено ничего — обложка последнего состоявшегося похода, как
 * было раньше. Пустого героя не бывает никогда: главная без картинки
 * выглядит поломкой, а не отсутствием выбора.
 *
 * Считается один раз на всех: кадры у всех гостей одни и те же.
 */
const loadHeroPhotos = unstable_cache(
  async function loadHeroPhotos(): Promise<HikePhoto[]> {
    const supabase = createPublicClient();

    const { data, error } = await supabase
      .from("hike_photos")
      .select("id, path, thumb_path")
      .eq("featured", true)
      .order("created_at", { ascending: false })
      .limit(HERO_LIMIT)
      .returns<PhotoRow[]>();

    if (error) {
      console.error("Не удалось получить снимки для главной", error);
      return [];
    }
    if (data.length > 0) return data.map(toPhoto);

    const fallback = await getHeroPhoto();
    return fallback ? [fallback] : [];
  },
  ["hero-photos"],
  { tags: [LANDING_PHOTOS_TAG], revalidate: PHOTOS_TTL_SECONDS },
);

export const listHeroPhotos = cache(loadHeroPhotos);

/**
 * Запасной кадр. Своего кэша не имеет: его зовут только изнутри
 * loadHeroPhotos, и результат уже лежит в её записи.
 */
const getHeroPhoto = cache(async function getHeroPhoto(): Promise<
  HikePhoto | null
> {
  const supabase = createPublicClient();

  // Два простых запроса вместо одного с сортировкой по присоединённой
  // таблице. Тот вариант короче, но его синтаксис проверяется только на
  // живой базе — локально ключи выдуманные, — а при отказе он деградирует
  // молча: код вернул бы null, и на экране это неотличимо от «фотографий
  // ещё нет». Здесь ломаться нечему.
  const { data: hikes, error: hikesError } = await supabase
    .from("hikes")
    .select("id")
    .in("status", ["published", "completed"])
    .lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(1)
    .returns<{ id: string }[]>();

  if (hikesError) {
    console.error("Не удалось найти поход для главной", hikesError);
    return null;
  }
  if (hikes.length === 0) return null;

  const { data, error } = await supabase
    .from("hike_photos")
    .select("id, path, thumb_path")
    .eq("hike_id", hikes[0].id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .returns<PhotoRow[]>();

  if (error) {
    console.error("Не удалось получить снимок для главной", error);
    return null;
  }
  return data.length > 0 ? toPhoto(data[0]) : null;
});

/**
 * Последние снимки по всем походам — для галереи на лендинге.
 *
 * Берём миниатюры и только у состоявшихся походов: витрина показывает то,
 * что уже было, а не то, что запланировано.
 */
const loadRecentPhotos = unstable_cache(
  async function loadRecentPhotos(limit = 12): Promise<HikePhoto[]> {
    const supabase = createPublicClient();

    // Тоже двумя запросами, по той же причине, что и в getHeroPhoto: фильтр
    // по присоединённой таблице проверяется только на живой базе, а ошибку
    // здесь видно не будет — галерея просто не покажется.
    const { data: hikes, error: hikesError } = await supabase
      .from("hikes")
      .select("id")
      .in("status", ["published", "completed"])
      .lt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: false })
      .limit(50)
      .returns<{ id: string }[]>();

    if (hikesError) {
      console.error("Не удалось найти походы для галереи", hikesError);
      return [];
    }
    if (hikes.length === 0) return [];

    const { data, error } = await supabase
      .from("hike_photos")
      .select("id, path, thumb_path")
      .in(
        "hike_id",
        hikes.map((h) => h.id),
      )
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<PhotoRow[]>();

    if (error) {
      console.error("Не удалось получить снимки для галереи", error);
      return [];
    }
    return data.map(toPhoto);
  },
  ["recent-photos"],
  { tags: [LANDING_PHOTOS_TAG], revalidate: PHOTOS_TTL_SECONDS },
);

export const listRecentPhotos = cache(loadRecentPhotos);
