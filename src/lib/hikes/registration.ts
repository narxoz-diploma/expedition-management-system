import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { HIKE_COLUMNS, mapHike, type Hike, type HikeRow } from "./types.ts";

export type RegistrationStatus = "confirmed" | "waitlist" | "cancelled";

export type MyRegistration = {
  status: RegistrationStatus;
  waitlistPos: number | null;
  /** Запись лидера: создана составом похода, отменяется тоже только им. */
  asLeader: boolean;
  /**
   * С какого момента место за человеком: подъём из очереди, иначе запись.
   * По нему решается, поздняя ли отмена, — см. lib/hikes/cancel-cutoff.ts.
   */
  spotSince: string;
};

/**
 * Своя запись на поход. Чужие записи политики RLS не отдадут, и это правильно:
 * список участников — дело лидера, а не соседа по группе.
 */
export const getMyRegistration = cache(async function getMyRegistration(
  hikeId: string,
): Promise<MyRegistration | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("registrations")
    .select("status, waitlist_pos, as_leader, created_at, promoted_at")
    .eq("hike_id", hikeId)
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .maybeSingle<{
      status: RegistrationStatus;
      waitlist_pos: number | null;
      as_leader: boolean;
      created_at: string;
      promoted_at: string | null;
    }>();

  if (error) {
    console.error("Не удалось прочитать запись на поход", error);
    return null;
  }
  if (!data) return null;

  return {
    status: data.status,
    waitlistPos: data.waitlist_pos,
    asLeader: data.as_leader,
    spotSince: data.promoted_at ?? data.created_at,
  };
});

export type MyHike = {
  status: RegistrationStatus;
  waitlistPos: number | null;
  hike: Hike;
};

/**
 * Свои походы, уже разделённые на ближайшие и прошедшие.
 *
 * Деление живёт здесь, а не в странице: «сейчас» — величина нечистая, и в теле
 * компонента ей не место. Заодно страница не занимается арифметикой дат.
 */
export const listMyHikes = cache(async function listMyHikes(): Promise<{
  upcoming: MyHike[];
  past: MyHike[];
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { upcoming: [], past: [] };

  const { data, error } = await supabase
    .from("registrations")
    .select(`status, waitlist_pos, hikes (${HIKE_COLUMNS})`)
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .returns<
      {
        status: RegistrationStatus;
        waitlist_pos: number | null;
        hikes: HikeRow | null;
      }[]
    >();

  if (error) {
    console.error("Не удалось прочитать свои походы", error);
    return { upcoming: [], past: [] };
  }

  const now = Date.now();
  const all = data
    .filter((row) => row.hikes !== null)
    .map((row) => ({
      status: row.status,
      waitlistPos: row.waitlist_pos,
      hike: mapHike(row.hikes as HikeRow),
    }));

  return {
    // Ближайшие — по возрастанию: первым идёт тот, что скоро.
    upcoming: all
      .filter((item) => new Date(item.hike.startsAt).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.hike.startsAt).getTime() -
          new Date(b.hike.startsAt).getTime(),
      ),
    // Прошедшие — по убыванию: сначала последний.
    //
    // Отменённые сюда не попадают вовсе. Деление идёт по дате, и без этого
    // условия отменённый поход назавтра переезжал бы в «Уже ходил» — то есть
    // сайт записывал бы человеку маршрут, которого не было.
    past: all
      .filter(
        (item) =>
          new Date(item.hike.startsAt).getTime() < now &&
          item.hike.status !== "cancelled",
      )
      .sort(
        (a, b) =>
          new Date(b.hike.startsAt).getTime() -
          new Date(a.hike.startsAt).getTime(),
      ),
  };
});
