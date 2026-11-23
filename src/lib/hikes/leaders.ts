import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type HikeLeader = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  /**
   * Ответственный за поход — тот, с кого спрос. Сначала автор, дальше — тот,
   * кому её передали: создатель и ответственный могут разойтись.
   */
  responsible: boolean;
};

/**
 * Кто ведёт поход.
 *
 * Имена берутся из витрины public_leaders, а не из profiles: карточку похода
 * читает и аноним, а таблица профилей закрыта политиками целиком.
 */
export const listHikeLeaders = cache(async function listHikeLeaders(
  hikeId: string,
  responsibleId: string,
): Promise<HikeLeader[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("hike_leaders")
    .select("user_id")
    .eq("hike_id", hikeId)
    .returns<{ user_id: string }[]>();

  if (error) {
    console.error("Не удалось прочитать состав лидеров", error);
    return [];
  }
  if (rows.length === 0) return [];

  const { data: people, error: peopleError } = await supabase
    .from("public_leaders")
    .select("id, full_name, avatar_url")
    .in(
      "id",
      rows.map((row) => row.user_id),
    )
    .returns<{ id: string; full_name: string; avatar_url: string | null }[]>();

  if (peopleError) {
    console.error("Не удалось прочитать имена лидеров", peopleError);
    return [];
  }

  return people
    .map((person) => ({
      id: person.id,
      fullName: person.full_name,
      avatarUrl: person.avatar_url,
      responsible: person.id === responsibleId,
    }))
    // Ответственный первым: с него спрос, ему и писать.
    .sort((a, b) => Number(b.responsible) - Number(a.responsible));
});

/** Все, кого вообще можно поставить лидером похода. */
export const listAvailableLeaders = cache(
  async function listAvailableLeaders(): Promise<
    { id: string; fullName: string }[]
  > {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("public_leaders")
      .select("id, full_name")
      .returns<{ id: string; full_name: string }[]>();

    if (error) {
      console.error("Не удалось прочитать список лидеров", error);
      return [];
    }
    return data.map((row) => ({ id: row.id, fullName: row.full_name }));
  },
);
