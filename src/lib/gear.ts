import { cache } from "react";

import type { GearItem, GearOwnership, MyGearItem } from "@/lib/gear-readiness";
import { createClient } from "@/lib/supabase/server";

export type { GearItem, GearOwnership, MyGearItem };
export {
  gearReadyUpTo,
  missingForCategory,
  promisedForCategory,
} from "@/lib/gear-readiness";

/**
 * Справочник снаряжения. Читают все, включая анонимов: страница «что взять» —
 * самая пересылаемая ссылка после карточки похода, и требовать ради неё вход
 * значит потерять половину тех, кому она нужна.
 */
export const listGear = cache(async function listGear(): Promise<GearItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gear_items")
    .select("id, slug, name, category, min_hike_category")
    .order("sort_order", { ascending: true })
    .returns<
      {
        id: string;
        slug: string;
        name: string;
        category: string | null;
        min_hike_category: number | null;
      }[]
    >();

  if (error) {
    console.error("Не удалось получить справочник снаряжения", error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    minHikeCategory: row.min_hike_category ?? 1,
  }));
});

/**
 * Справочник вместе со своими отметками.
 *
 * Отсутствие строки в user_gear и отметка «нет» — разные вещи по смыслу
 * («не отвечал» против «ответил, что нет»), но для интерфейса это одно и то
 * же состояние. Поэтому недостающие строки просто добираются как 'none',
 * а не заводятся в базе заранее.
 */
export const listMyGear = cache(async function listMyGear(): Promise<
  MyGearItem[]
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [items, { data: mine, error }] = await Promise.all([
    listGear(),
    supabase
      .from("user_gear")
      .select("gear_id, ownership")
      .eq("user_id", user.id)
      .returns<{ gear_id: string; ownership: GearOwnership }[]>(),
  ]);

  if (error) {
    console.error("Не удалось прочитать своё снаряжение", error);
  }

  const owned = new Map((mine ?? []).map((row) => [row.gear_id, row.ownership]));

  return items.map((item) => ({
    ...item,
    ownership: owned.get(item.id) ?? "none",
  }));
});
