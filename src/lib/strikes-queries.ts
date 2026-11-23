import { createClient } from "@/lib/supabase/server";

import type { Strike, StrikeKind } from "./strikes";

type StrikeRow = {
  hike_id: string;
  hike_title: string;
  hike_slug: string;
  hike_starts_at: string;
  kind: StrikeKind;
  weight: number;
  remaining: number;
  threshold: number;
};

function toStrike(row: StrikeRow): Strike {
  return {
    hikeId: row.hike_id,
    hikeTitle: row.hike_title,
    hikeSlug: row.hike_slug,
    hikeStartsAt: row.hike_starts_at,
    kind: row.kind,
    weight: row.weight,
    remaining: row.remaining,
    threshold: row.threshold,
  };
}

/**
 * Свои действующие отметки.
 *
 * Сбой чтения превращается в «отметок нет», и это осознанно: запись всё
 * равно решает база по тем же отметкам, а экран без них покажет обычную
 * кнопку, и человек узнает про очередь из ответа. Выдумать отметки, которых
 * нет, было бы хуже.
 */
export async function getMyStrikes(): Promise<Strike[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_strikes");
  if (error) {
    console.error("Не удалось прочитать свои отметки", error);
    return [];
  }
  // Приведение руками: типы БД не сгенерированы, и rpc отдаёт неизвестное.
  return ((data ?? []) as StrikeRow[]).map(toStrike);
}

/**
 * Отметки людей — лидеру, по человеку. null — весь клуб, для справочника:
 * строк немного, только действующие.
 */
export async function getStaffStrikes(
  userIds: string[] | null,
): Promise<Map<string, Strike[]>> {
  const byUser = new Map<string, Strike[]>();
  if (userIds !== null && userIds.length === 0) return byUser;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_strike_rows", { p_user_ids: userIds });
  if (error) {
    console.error("Не удалось прочитать отметки", error);
    return byUser;
  }

  for (const row of (data ?? []) as (StrikeRow & { user_id: string })[]) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(toStrike(row));
    byUser.set(row.user_id, list);
  }
  return byUser;
}

export type StrikeSettings = {
  lateCancelWeight: number;
  noShowWeight: number;
  threshold: number;
  lifetimeHikes: number;
  /** Вписана ли дата отсчёта. Пока нет — отметок нет ни у кого. */
  active: boolean;
};

/**
 * Числа правил — для страницы правил и экрана лидера. null при сбое:
 * вызывающий тогда молчит о числах, а не печатает придуманные.
 */
export async function getStrikeSettings(): Promise<StrikeSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("strike_settings");
  if (error) {
    console.error("Не удалось прочитать настройки отметок", error);
    return null;
  }
  const row = ((data ?? []) as {
    late_cancel_weight: number;
    no_show_weight: number;
    restriction_threshold: number;
    strike_lifetime_hikes: number;
    active: boolean;
  }[])[0];
  if (!row) return null;
  return {
    lateCancelWeight: row.late_cancel_weight,
    noShowWeight: row.no_show_weight,
    threshold: row.restriction_threshold,
    lifetimeHikes: row.strike_lifetime_hikes,
    active: row.active,
  };
}

/** Какие отметки на этом походе лидер уже снял — ключ «userId:kind». */
export async function getHikeExcuses(hikeId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hike_strike_excuses", { p_hike_id: hikeId });
  if (error) {
    console.error("Не удалось прочитать уважительные причины", error);
    return new Set();
  }
  return new Set(
    ((data ?? []) as { user_id: string; kind: StrikeKind }[]).map(
      (row) => `${row.user_id}:${row.kind}`,
    ),
  );
}
