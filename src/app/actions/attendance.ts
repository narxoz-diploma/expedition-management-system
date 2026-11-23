"use server";


import { requireStaff } from "@/lib/auth-guards";
import { dbErrorMessage } from "@/lib/db-errors";
import { hikeSlugForRevalidate } from "@/lib/hikes/queries";
import type { AttendanceResult } from "@/lib/hikes/roster";
import { createClient } from "@/lib/supabase/server";
import { revalidateLocalized } from "@/lib/i18n/server";

export type AttendanceActionResult = { ok: boolean; message?: string };

/**
 * Отметка явки.
 *
 * Через mark_attendance(): она идемпотентна и сама переводит новичка в
 * участники клуба после первого пройденного маршрута. Двойное нажатие на
 * морозе не накручивает счётчик неявок, а исправление ошибки его откатывает.
 */
export async function markAttendance(
  hikeId: string,
  userId: string,
  result: AttendanceResult,
): Promise<AttendanceActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_attendance", {
    p_hike_id: hikeId,
    p_user_id: userId,
    p_result: result,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  const slug = await hikeSlugForRevalidate(hikeId);
  if (slug) revalidateLocalized(`/hikes/${slug}`);
  revalidateLocalized(`/admin/hikes/${hikeId}`);
  revalidateLocalized(`/admin/hikes/${hikeId}/attendance`);
  return { ok: true };
}

/**
 * Снятие отметки.
 *
 * Отдельная функция, а не mark_attendance(null): «не отмечен» — это
 * отсутствие строки, и выражать его значением пришлось бы через nullable
 * колонку, которая ничего не значит. Счётчик неявок база откатывает сама,
 * как и членство, если оно было выдано за этот же поход.
 */
export async function clearAttendance(
  hikeId: string,
  userId: string,
): Promise<AttendanceActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_attendance", {
    p_hike_id: hikeId,
    p_user_id: userId,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  const slug = await hikeSlugForRevalidate(hikeId);
  if (slug) revalidateLocalized(`/hikes/${slug}`);
  revalidateLocalized(`/admin/hikes/${hikeId}`);
  revalidateLocalized(`/admin/hikes/${hikeId}/attendance`);
  return { ok: true };
}

/**
 * «Все дошли» — итог всей группе разом.
 *
 * Переводит в «прошёл» только отмеченных «пришёл»: не пришедших и тех, про
 * кого лидер вообще ничего не сказал, кнопка не трогает. Считает база, а не
 * этот код — там же проверка прав, счётчики и членство.
 */
export async function markAllCompleted(
  hikeId: string,
): Promise<AttendanceActionResult & { count?: number }> {
  await requireStaff();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_completed", {
    p_hike_id: hikeId,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  const slug = await hikeSlugForRevalidate(hikeId);
  if (slug) revalidateLocalized(`/hikes/${slug}`);
  revalidateLocalized(`/admin/hikes/${hikeId}`);
  revalidateLocalized(`/admin/hikes/${hikeId}/attendance`);
  return { ok: true, count: typeof data === "number" ? data : undefined };
}

/**
 * Запись участника лидером вручную.
 *
 * Единственный способ записать выпускника или новичка на закрытый поход.
 * Вместимость и лист ожидания соблюдаются как обычно.
 */
export async function addParticipant(
  hikeId: string,
  userId: string,
): Promise<AttendanceActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_participant", {
    p_hike_id: hikeId,
    p_user_id: userId,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidateLocalized(`/admin/hikes/${hikeId}`);
  return { ok: true };
}

/**
 * Взять человека из очереди на свободное место — в любом порядке.
 *
 * После закрытия записи очередь сама не двигается (миграция
 * 20260921130000_freeze_waitlist_after_close.sql): лидер пишет человеку и
 * берёт того, кто подтвердил. Поднятый сайтом ночью накануне об этом не
 * узнавал и не шёл.
 */
export async function takeFromWaitlist(
  hikeId: string,
  userId: string,
): Promise<AttendanceActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("take_from_waitlist", {
    p_hike_id: hikeId,
    p_user_id: userId,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  const slug = await hikeSlugForRevalidate(hikeId);
  if (slug) revalidateLocalized(`/hikes/${slug}`);
  revalidateLocalized(`/admin/hikes/${hikeId}`);
  return { ok: true };
}

/**
 * «Уважительная причина»: снять отметку или вернуть её.
 *
 * Сайт не знает, заболел человек или проспал, — знает лидер. Возврат нужен
 * по той же причине, что «снять» у отметки явки: промах исправляется той же
 * кнопкой.
 */
export async function excuseStrike(
  hikeId: string,
  userId: string,
  kind: "late_cancel" | "no_show",
  excused: boolean,
): Promise<AttendanceActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("excuse_strike", {
    p_hike_id: hikeId,
    p_user_id: userId,
    p_kind: kind,
    p_excused: excused,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidateLocalized(`/admin/hikes/${hikeId}`);
  revalidateLocalized("/profile");
  return { ok: true };
}

/** Снятие участника лидером — например, когда человек написал в чат. */
export async function removeParticipant(
  hikeId: string,
  userId: string,
): Promise<AttendanceActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_registration", {
    p_hike_id: hikeId,
    p_user_id: userId,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidateLocalized(`/admin/hikes/${hikeId}`);
  return { ok: true };
}
