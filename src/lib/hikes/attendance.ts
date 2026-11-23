import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import type { AttendanceResult } from "./attendance-progress.ts";

export type AttendancePerson = {
  userId: string;
  fullName: string;
  result: AttendanceResult | null;
};

/**
 * Состав похода для экрана явки: имя и отметка, больше ничего.
 *
 * Отдельным запросом, а не через getRoster(): тот тянет снаряжение,
 * экстренные контакты и телефоны — то есть ровно то, ради ненадобности чего
 * экран явки и вынесен из ростера. На точке сбора нужны имя и три кнопки.
 *
 * Идущие лидеры сюда не попадают, как и в ростере: явку им никто не
 * отмечает, их присутствие подтверждено тем, что они ведут.
 *
 * Проверки прав здесь нет: политики RLS отдают чужие записи только лидеру
 * этого похода, и забытая проверка вернёт пустоту, а не чужой состав. Но
 * страница всё равно проверяет доступ до вызова — пустой список выглядел бы
 * как «никто не записался», а это другая правда.
 */
export const getAttendanceRoster = cache(async function getAttendanceRoster(
  hikeId: string,
): Promise<AttendancePerson[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("registrations")
    .select(`user_id, created_at, profiles ( full_name )`)
    .eq("hike_id", hikeId)
    .eq("status", "confirmed")
    .eq("as_leader", false)
    // Порядок записи, а не алфавит: он устойчив. На экране, который
    // перерисовывается после каждого нажатия, человек не должен уезжать
    // из-под пальца — а по алфавиту строки прыгали бы при любой правке имени.
    .order("created_at", { ascending: true })
    .returns<{ user_id: string; created_at: string; profiles: { full_name: string } | null }[]>();

  if (error) {
    console.error("Не удалось получить состав для отметок явки", error);
    return [];
  }

  const { data: marks } = await supabase
    .from("attendance")
    .select("user_id, result")
    .eq("hike_id", hikeId)
    .returns<{ user_id: string; result: AttendanceResult }[]>();

  const marked = new Map((marks ?? []).map((m) => [m.user_id, m.result]));

  return data
    .filter((row) => row.profiles !== null)
    .map((row) => ({
      userId: row.user_id,
      fullName: row.profiles!.full_name,
      result: marked.get(row.user_id) ?? null,
    }));
});
