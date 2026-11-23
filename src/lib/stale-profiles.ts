import { createClient } from "@/lib/supabase/server";

export type StaleProfile = {
  id: string;
  fullName: string;
  membershipStatus: string;
  createdAt: string;
  /** Последний поход; null — не ходил ни разу. */
  lastHikeAt: string | null;
  hasEmergencyContact: boolean;
};

/**
 * Кого пора удалить по сроку хранения.
 *
 * Считает вьюха `stale_profiles`: год без походов. Двенадцать месяцев, чтобы
 * академический год с летними каникулами помещался внутрь — сходивший в мае
 * и вернувшийся в сентябре не должен обнаружить пустой профиль.
 *
 * Проверки прав здесь нет: вьюха объявлена с `security_invoker`, и политика
 * `profiles_select` отдаёт чужие строки только админу. Забытая проверка
 * вернёт пустоту, а не список клуба.
 */
export async function listStaleProfiles(): Promise<StaleProfile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stale_profiles")
    .select("id, full_name, membership_status, created_at, last_hike_at, has_emergency_contact")
    .order("last_hike_at", { ascending: true, nullsFirst: true })
    .returns<
      {
        id: string;
        full_name: string;
        membership_status: string;
        created_at: string;
        last_hike_at: string | null;
        has_emergency_contact: boolean;
      }[]
    >();

  if (error) {
    console.error("Не удалось прочитать просроченные профили", error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    membershipStatus: row.membership_status,
    createdAt: row.created_at,
    lastHikeAt: row.last_hike_at,
    hasEmergencyContact: row.has_emergency_contact,
  }));
}
