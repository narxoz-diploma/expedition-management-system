import { createClient } from "@/lib/supabase/server";

import { getStaffStrikes } from "@/lib/strikes-queries";

import type { ChatStatus } from "./hikes/chat-roster.ts";
import { summarizeStrikes, type StrikeSummary } from "./strikes.ts";

export type DirectoryPerson = {
  id: string;
  fullName: string;
  membershipStatus: "guest" | "pending" | "member" | "alumni";
  studyYear: number | null;
  phone: string | null;
  fitnessLevel: number | null;
  visitedPlaces: string | null;
  /** Действующие отметки — вместо счётчика поздних отмен по старому правилу. */
  strikes: StrikeSummary;
  noShowCount: number;
  chatStatus: ChatStatus | null;
  /** Все походы: пройденные участником и проведённые лидером. */
  hikesCompleted: number;
  /**
   * Сколько из них вёл. Лидеру итог «Пройден» никто не ставит — без этого
   * счётчик лидера застывал на походах, куда он ходил участником.
   */
  hikesLed: number;
  /** Последний прошедший поход, на который человек был записан. */
  lastHikeAt: string | null;
};

/**
 * Потолок выборки справочника.
 *
 * Стоял 200 — и клуб его перерос молча: страница писала «Найдено — 200», то
 * есть ровно свой же лимит, а люди дальше по алфавиту не приезжали вовсе.
 * Поиском их было не найти, и выглядело это как «человека нет в клубе».
 * Выше 1000 без настройки проекта всё равно не прыгнуть: у PostgREST свой
 * потолок `max-rows`, в Supabase он по умолчанию тысяча.
 */
export const DIRECTORY_LIMIT = 1000;

export type DirectoryList = {
  people: DirectoryPerson[];
  /** Выборка упёрлась в потолок: показаны не все, и об этом надо сказать. */
  truncated: boolean;
};

/**
 * Справочник клуба.
 *
 * Отдаёт клуб целиком, без поиска и фильтров: их делает клиент. Строки и
 * так все на странице, а серверный поиск стоил бы лидеру нажатия кнопки и
 * перезагрузки на каждый запрос — при том, что переслать этот адрес некому.
 *
 * Читает вьюху `club_directory`: она обходит RLS и сама проверяет внутри
 * `is_staff()`, поэтому проверки прав здесь нет — забытая вернёт пустоту, а
 * не список клуба. Экстренных контактов и даты рождения там нет вовсе:
 * граница проведена списком колонок, а не политикой.
 */
export async function listDirectory(): Promise<DirectoryList> {
  const supabase = await createClient();

  const request = supabase
    .from("club_directory")
    .select(
      "id, full_name, membership_status, study_year, phone, fitness_level, " +
        "visited_places, no_show_count, club_chat_status, " +
        "hikes_completed, hikes_led, last_hike_at",
    );

  const [{ data, error }, strikes] = await Promise.all([
    request.order("full_name", { ascending: true })
    .limit(DIRECTORY_LIMIT)
    .returns<
      {
        id: string;
        full_name: string;
        membership_status: DirectoryPerson["membershipStatus"];
        study_year: number | null;
        phone: string | null;
        fitness_level: number | null;
        visited_places: string | null;
        no_show_count: number;
        club_chat_status: ChatStatus | null;
        hikes_completed: number;
        hikes_led: number;
        last_hike_at: string | null;
      }[]
    >(),
    getStaffStrikes(null),
  ]);

  if (error) {
    console.error("Не удалось прочитать справочник клуба", error);
    return { people: [], truncated: false };
  }

  const people = data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    membershipStatus: row.membership_status,
    studyYear: row.study_year,
    phone: row.phone,
    fitnessLevel: row.fitness_level,
    visitedPlaces: row.visited_places,
    strikes: summarizeStrikes(strikes.get(row.id) ?? []),
    noShowCount: row.no_show_count,
    chatStatus: row.club_chat_status,
    hikesCompleted: row.hikes_completed,
    hikesLed: row.hikes_led,
    lastHikeAt: row.last_hike_at,
  }));

  return { people, truncated: people.length >= DIRECTORY_LIMIT };
}
