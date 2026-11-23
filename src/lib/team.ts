import { cache } from "react";

import { listPublicLeaders, type PublicLeader } from "@/lib/club-stats";
import { listPastHikes, listUpcomingHikes } from "@/lib/hikes/queries";
import type { Hike } from "@/lib/hikes/types";
import { createClient } from "@/lib/supabase/server";

export type TeamMember = PublicLeader & {
  /** Ближайшие опубликованные походы, которые человек ведёт. */
  upcoming: Hike[];
  /** Последние прошедшие, не больше трёх. */
  recent: Hike[];
};

const RECENT_LIMIT = 3;

/**
 * Команда клуба для страницы /team.
 *
 * Общего «провёл N походов» здесь нет намеренно: прошедшие походы читаются с
 * потолком (listPastHikes, 50 штук), и число из обрезанной выборки молча
 * врало бы у самых опытных — ровно у тех, ради кого его показывают. Три
 * последних похода по этой выборке честны всегда.
 */
export const listTeam = cache(async function listTeam(): Promise<TeamMember[]> {
  const [leaders, upcoming, past] = await Promise.all([
    listPublicLeaders(),
    listUpcomingHikes(),
    listPastHikes(),
  ]);
  if (leaders.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hike_leaders")
    .select("hike_id, user_id")
    .in(
      "user_id",
      leaders.map((leader) => leader.id),
    )
    .returns<{ hike_id: string; user_id: string }[]>();

  if (error) {
    // Без походов страница команды всё равно полезна — лица, роли, инстаграм.
    console.error("Не удалось прочитать, кто какие походы ведёт", error);
  }

  const hikesByUser = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const set = hikesByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.hike_id);
    hikesByUser.set(row.user_id, set);
  }

  return leaders.map((leader) => {
    const mine = hikesByUser.get(leader.id) ?? new Set<string>();
    return {
      ...leader,
      upcoming: upcoming.filter((hike) => mine.has(hike.id)),
      // Разные маршруты, а не походы: клуб ходит одними и теми же, и
      // «Горельник, …, Горельник» читалось опечаткой. Повторы убираются до
      // обрезки, чтобы трёх разных набиралось, когда они есть.
      recent: past
        .filter((hike) => hike.status === "completed" && mine.has(hike.id))
        .filter(
          (hike, index, list) =>
            list.findIndex(
              (other) => (other.routeName ?? other.title) === (hike.routeName ?? hike.title),
            ) === index,
        )
        .slice(0, RECENT_LIMIT),
    };
  });
});

/** Своя карточка в команде — для формы в профиле. */
export async function getMyTeamCard(
  userId: string,
): Promise<{ bio: string; instagram: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("bio, instagram")
    .eq("id", userId)
    .maybeSingle<{ bio: string | null; instagram: string | null }>();

  if (error) console.error("Не удалось прочитать карточку в команде", error);
  return { bio: data?.bio ?? "", instagram: data?.instagram ?? "" };
}
