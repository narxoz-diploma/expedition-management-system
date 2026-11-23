"use server";


import { requireStaff } from "@/lib/auth-guards";
import { dbErrorCode, dbErrorMessage } from "@/lib/db-errors";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale, revalidateLocalized } from "@/lib/i18n/server";

export type DeleteResult = { ok: boolean; message?: string };

/**
 * Удаление своих данных.
 *
 * Своё удаляет сам человек, без просьбы к админу: ушедшему из клуба иначе
 * пришлось бы написать тому, от кого он ушёл, — ровно та причина, по которой
 * такие кнопки делают самообслуживаемыми.
 *
 * База сносит всё каскадом от auth.users и по дороге отменяет записи на
 * будущие походы по-настоящему, чтобы место ушло первому из очереди.
 */
export async function deleteMyAccount(): Promise<DeleteResult> {
  const [supabase, locale] = await Promise.all([createClient(), getLocale()]);
  const t = getDictionary(locale).profileActions;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: t.needSignIn };

  const { error } = await supabase.rpc("delete_account", { p_user: null });

  if (error) {
    if (dbErrorCode(error) === "LEADS_FUTURE_HIKE") {
      return { ok: false, message: t.leadsFutureDelete };
    }
    return { ok: false, message: dbErrorMessage(error, locale) };
  }

  // Учётной записи больше нет, а кука о ней ещё помнит. Без выхода человек
  // остался бы с сессией, ведущей в никуда: любой запрос отдавал бы пустоту,
  // и это выглядело бы поломкой, а не выполненной просьбой.
  await supabase.auth.signOut();
  return { ok: true };
}

/** То же самое, но по сроку хранения и руками админа. */
export async function deleteAccountByAdmin(
  userId: string,
): Promise<DeleteResult> {
  const profile = await requireStaff();
  if (profile.role !== "admin") {
    return { ok: false, message: "Удалять данные людей может только админ" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_account", { p_user: userId });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidateLocalized("/admin/data");
  return { ok: true };
}

/** Ведёт ли человек будущий поход — чтобы сказать это до нажатия, а не после. */
export async function iLeadFutureHike(): Promise<boolean> {
  const profile = await getCurrentProfile();
  if (!profile) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("hikes")
    .select("id")
    .eq("leader_id", profile.id)
    .neq("status", "cancelled")
    .gt("starts_at", new Date().toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}
