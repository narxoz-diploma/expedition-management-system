"use server";


import { requireStaff } from "@/lib/auth-guards";
import { dbErrorMessage } from "@/lib/db-errors";
import { hikeSlugForRevalidate } from "@/lib/hikes/queries";
import { createClient } from "@/lib/supabase/server";
import { revalidateLocalized } from "@/lib/i18n/server";

export type LeaderActionResult = { ok: boolean; message?: string };

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Это может только тот, кто отвечает за поход.",
  NOT_A_LEADER: "Этого человека нельзя поставить лидером — у него нет роли лидера.",
  CANNOT_REMOVE_RESPONSIBLE:
    "Ответственного убрать нельзя: сначала передай ответственность другому.",
  ALREADY_RESPONSIBLE: "Этот человек и так отвечает за поход.",
  HIKE_NOT_FOUND: "Поход не найден.",
};

function message(error: unknown): string {
  const raw = String(
    typeof error === "object" && error && "message" in error
      ? (error as { message: unknown }).message
      : error,
  );
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return text;
  }
  return dbErrorMessage(error);
}

export async function addHikeLeader(
  hikeId: string,
  userId: string,
): Promise<LeaderActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_hike_leader", {
    p_hike_id: hikeId,
    p_user_id: userId,
  });

  if (error) return { ok: false, message: message(error) };

  await refresh(hikeId);
  return { ok: true };
}

export async function removeHikeLeader(
  hikeId: string,
  userId: string,
): Promise<LeaderActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_hike_leader", {
    p_hike_id: hikeId,
    p_user_id: userId,
  });

  if (error) return { ok: false, message: message(error) };

  await refresh(hikeId);
  return { ok: true };
}

/**
 * Передача ответственности за поход.
 *
 * Отдельно от смены состава: состав — это кто идёт, ответственность — с кого
 * спрос. Проверку прав делает сама функция БД, и не только она: смену
 * `leader_id` стережёт триггер, потому что править поход вправе любой из
 * состава, а anon key лежит в клиентском бандле.
 */
export async function transferHikeResponsibility(
  hikeId: string,
  userId: string,
): Promise<LeaderActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_hike_responsibility", {
    p_hike_id: hikeId,
    p_user_id: userId,
  });

  if (error) return { ok: false, message: message(error) };

  await refresh(hikeId);
  // Список походов показывает ответственного — он там тоже устарел.
  revalidateLocalized("/admin/hikes");
  return { ok: true };
}

async function refresh(hikeId: string) {
  const slug = await hikeSlugForRevalidate(hikeId);
  if (slug) revalidateLocalized(`/hikes/${slug}`);
  revalidateLocalized(`/admin/hikes/${hikeId}/edit`);
}
