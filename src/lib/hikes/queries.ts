import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

import { HIKE_COLUMNS, mapHike, type Hike, type HikeRow } from "./types.ts";

/**
 * Ближайшие опубликованные походы.
 *
 * Черновики сюда не попадают по политике RLS, а не по этому фильтру: фильтр
 * лишь уточняет выборку, защита живёт в базе. Лидер увидел бы здесь и свои
 * черновики, поэтому статус всё же указан явно.
 */
export const listUpcomingHikes = cache(async function listUpcomingHikes(): Promise<
  Hike[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hikes")
    .select(HIKE_COLUMNS)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .returns<HikeRow[]>();

  if (error) {
    console.error("Не удалось получить список походов", error);
    return [];
  }
  return data.map(mapHike);
});

/** Прошедшие походы — они работают как портфолио клуба. */
export const listPastHikes = cache(async function listPastHikes(): Promise<
  Hike[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hikes")
    .select(HIKE_COLUMNS)
    .in("status", ["published", "completed"])
    .lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(50)
    .returns<HikeRow[]>();

  if (error) {
    console.error("Не удалось получить прошедшие походы", error);
    return [];
  }
  return data.map(mapHike);
});

/**
 * Поход по адресу. `null` — похода нет; упавший запрос кидает исключение.
 *
 * Разница не формальная. Раньше обе беды возвращали `null`, страница на
 * `null` звала `notFound()`, и во время сбоя Supabase живой поход
 * показывал «Такого похода нет» — то есть сайт уверенно врал человеку,
 * который пришёл по действующей ссылке из чата, и советовал ему смотреть
 * другие походы. Теперь такой случай доходит до `error.tsx`, где написано
 * «что-то сломалось» и стоит кнопка «Попробовать снова» — а она в этом
 * случае и правда помогает: чаще всего это уснувшая на бесплатном тарифе
 * база, которая просыпается за секунду.
 *
 * Политики RLS сюда не попадают: запрещённая строка возвращается как пустой
 * результат, а не как ошибка, — и это по-прежнему честный `null`.
 */
export const getHikeBySlug = cache(async function getHikeBySlug(
  slug: string,
): Promise<Hike | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hikes")
    .select(HIKE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<HikeRow>();

  if (error) {
    throw new Error(`Не удалось получить поход ${slug}`, { cause: error });
  }
  return data ? mapHike(data) : null;
});

/**
 * Поход для картинки превью — без кук и без сессии.
 *
 * Отдельно от getHikeBySlug ровно из-за кук: чтение сессии делает маршрут
 * динамическим целиком, и выставленный на картинке revalidate не работает
 * вовсе. Ошибки при этом нет, картинка исправно отдаётся — просто каждый раз
 * заново.
 *
 * Клиент анонимный, значит видно только опубликованное, — а больше и не
 * нужно: за превью приходит краулер мессенджера, и черновик ему показывать
 * нечего.
 */
export const getPublicHikeBySlug = cache(async function getPublicHikeBySlug(
  slug: string,
): Promise<Hike | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("hikes")
    .select(HIKE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<HikeRow>();

  if (error) {
    throw new Error(`Не удалось получить поход ${slug}`, { cause: error });
  }
  return data ? mapHike(data) : null;
});

/** То же, что getHikeBySlug, и с тем же разделением ошибки и отсутствия. */
export const getHikeById = cache(async function getHikeById(
  id: string,
): Promise<Hike | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hikes")
    .select(HIKE_COLUMNS)
    .eq("id", id)
    .maybeSingle<HikeRow>();

  if (error) {
    throw new Error(`Не удалось получить поход ${id}`, { cause: error });
  }
  return data ? mapHike(data) : null;
});

/**
 * Адрес похода для сброса кэша — молча, без исключений.
 *
 * Нужен там, где мутация уже прошла: запись сохранена, отметка поставлена, и
 * дальше остаётся обновить страницы. Если на этом шаге упасть, человек
 * увидит «не сохранилось» про то, что сохранено, и нажмёт ещё раз — а это
 * хуже, чем устаревшая на минуту страница. Поэтому здесь ошибка гасится
 * намеренно, и только здесь.
 */
export async function hikeSlugForRevalidate(id: string): Promise<string | null> {
  try {
    return (await getHikeById(id))?.slug ?? null;
  } catch (e) {
    console.error("Не удалось узнать адрес похода для сброса кэша", e);
    return null;
  }
}

/**
 * Все походы, включая черновики. Что именно вернётся — решает RLS:
 * лидер видит свои и чужие опубликованные, админ — всё.
 */
export const listAllHikes = cache(async function listAllHikes(): Promise<
  Hike[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hikes")
    .select(HIKE_COLUMNS)
    .order("starts_at", { ascending: false })
    .returns<HikeRow[]>();

  if (error) {
    console.error("Не удалось получить походы для админки", error);
    return [];
  }
  return data.map(mapHike);
});
