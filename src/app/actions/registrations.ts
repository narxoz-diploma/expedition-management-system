"use server";


import { dbErrorCode, dbErrorMessage } from "@/lib/db-errors";
import { hikeSlugForRevalidate } from "@/lib/hikes/queries";
import type { RegistrationStatus } from "@/lib/hikes/registration";
import { createClient } from "@/lib/supabase/server";
import { getLocale, revalidateLocalized } from "@/lib/i18n/server";

export type RegistrationResult = {
  ok: boolean;
  status?: RegistrationStatus;
  waitlistPos?: number | null;
  message?: string;
  /** Профиль не заполнен — интерфейс должен отправить человека дозаполнять. */
  needsProfile?: boolean;
};

/**
 * Запись в поход.
 *
 * Только через register_for_hike(): функция блокирует строку похода и потому
 * переживает сто одновременных нажатий без перебора мест. Прямая вставка в
 * registrations закрыта политиками RLS намеренно — обходить нельзя.
 */
export async function registerForHike(
  hikeId: string,
): Promise<RegistrationResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("register_for_hike", { p_hike_id: hikeId })
    .single<{ status: RegistrationStatus; waitlist_pos: number | null }>();

  if (error) {
    const code = dbErrorCode(error);
    if (code === "UNKNOWN") {
      console.error("register_for_hike вернул неизвестную ошибку", error);
    }
    // Язык — из заголовка proxy: действие отправляется на адрес страницы
    // похода, и /en/hikes/… приносит английский.
    return {
      ok: false,
      message: dbErrorMessage(error, await getLocale()),
      needsProfile: code === "PROFILE_INCOMPLETE",
    };
  }

  await refresh(hikeId);
  return { ok: true, status: data.status, waitlistPos: data.waitlist_pos };
}

/** Отмена своей записи. Первый из очереди поднимается автоматически, в базе. */
export async function cancelMyRegistration(
  hikeId: string,
): Promise<RegistrationResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("cancel_registration", {
    p_hike_id: hikeId,
  });

  if (error) {
    return { ok: false, message: dbErrorMessage(error, await getLocale()) };
  }

  await refresh(hikeId);
  return { ok: true };
}

async function refresh(hikeId: string) {
  const slug = await hikeSlugForRevalidate(hikeId);
  if (slug) revalidateLocalized(`/hikes/${slug}`);
  revalidateLocalized("/hikes");
  revalidateLocalized("/profile");
}
