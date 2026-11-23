import { cache } from "react";

import { listGear } from "@/lib/gear";
import {
  gearGapForCategory,
  gearReadyUpTo,
  type GearGap,
  type GearOwnership,
} from "@/lib/gear-readiness";
import { ageOn } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { getStaffStrikes } from "@/lib/strikes-queries";

import { bucketRoster } from "./roster-buckets.ts";
import { summarizeStrikes, type StrikeSummary } from "../strikes.ts";

import type { AttendanceResult } from "./attendance-progress.ts";

import type { RegistrationStatus } from "./registration.ts";

/** Определение живёт в attendance-progress.ts — там же, где фазы и сводка. */
export type { AttendanceResult };

/**
 * Снаряжение человека для строки состава.
 *
 * Пробел к категории похода — то, ради чего строка и нужна лидеру. Но одного
 * пробела мало: у собранного человека не появлялось ничего, и лидер не
 * отличал «всё есть» от «строка не отрисовалась». Поэтому рядом лежит и
 * положительный факт (до какой категории снаряжён), и полный набор — он
 * раскрывается по «Подробнее», а не висит стеной на двадцать человек.
 */
export type RosterGear = GearGap & {
  readyUpTo: number;
  items: { name: string; ownership: GearOwnership }[];
};

export type RosterEntry = {
  userId: string;
  fullName: string;
  phone: string | null;
  studyYear: number | null;
  /** Возраст на дату похода, а не на сегодня: по нему определяется, нужен ли родитель. */
  ageOnHike: number | null;
  isMinor: boolean;
  status: RegistrationStatus;
  waitlistPos: number | null;
  manualOverride: boolean;
  /** Идёт лидером: места участника не занимает. */
  asLeader: boolean;
  /**
   * Действующие отметки. Вместо счётчика поздних отмен: тот копился по
   * правилу «12 часов», которое ловило не то (см. миграцию
   * 20260921120000_late_cancel_after_close.sql), и расходился с правилом.
   */
  strikes: StrikeSummary;
  /** Неявки за всё время — история, а не наказание: её копит отметка явки. */
  noShowCount: number;
  /** Самооценка формы, 1–3. Подписи — в `lib/fitness.ts`. */
  fitnessLevel: number | null;
  /** Когда отменил запись; null — не отменял. */
  cancelledAt: string | null;
  /**
   * Сам отказался от места после закрытия записи, а место было за ним ещё
   * до неё, — группа осталась без человека, на которого рассчитывала.
   */
  wasLateCancel: boolean;
  /** Запись снял лидер. Поздней такая отмена не бывает. */
  cancelledByLeader: boolean;
  /**
   * Где человек был до клуба, своими словами. Пройденное с клубом видно по
   * его записям, а это — единственный источник про всё остальное.
   */
  visitedPlaces: string | null;
  attendance: AttendanceResult | null;
  emergencyContacts: { fullName: string; phone: string; isParent: boolean }[];
  /**
   * Чего не хватает к категории этого похода.
   *
   * `null` — человек анкету снаряжения не открывал, и это **не** то же самое,
   * что «ничего нет». Для него самого разницы нет, и в `listMyGear` эти два
   * состояния слиты намеренно. Лидеру они дают разные действия: «ответил, что
   * нет ботинок» — напомнить купить, «не отвечал» — сперва спросить.
   */
  gear: RosterGear | null;
};

export type Roster = {
  /** Лидеры отдельно: они не из вместимости и снимать их с похода нельзя. */
  leaders: RosterEntry[];
  confirmed: RosterEntry[];
  waitlist: RosterEntry[];
  /**
   * Отменившиеся, свежие сверху.
   *
   * Лидеру они нужны дважды: понять, кто выпал перед выходом, и вычистить
   * группу в WhatsApp — оттуда сайт не удалит никого, он может только
   * сказать кого.
   */
  cancelled: RosterEntry[];
};

/**
 * Список группы для лидера: кто идёт, их телефоны, отметки явки и контакты
 * на случай ЧП.
 *
 * Всё это отдают политики RLS только лидеру этого похода. Никакой проверки
 * прав здесь нет намеренно: если её забыть, запрос вернёт пустоту, а не чужие
 * данные — база не отдаст того, чего не должна.
 */
export const getRoster = cache(async function getRoster(
  hikeId: string,
  startsAt: string,
  category: number,
): Promise<Roster> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("registrations")
    .select(
      `user_id, status, waitlist_pos, manual_override, as_leader, created_at,
       cancelled_at, was_late_cancel, cancelled_by_leader,
       profiles ( full_name, phone, birth_date, study_year, visited_places,
                  fitness_level, no_show_count,
                  emergency_contacts ( full_name, phone, is_parent ) )`,
    )
    .eq("hike_id", hikeId)
    .order("created_at", { ascending: true })
    .returns<RegistrationRow[]>();

  if (error) {
    console.error("Не удалось получить список группы", error);
    return { leaders: [], confirmed: [], waitlist: [], cancelled: [] };
  }

  const { data: attendance } = await supabase
    .from("attendance")
    .select("user_id, result")
    .eq("hike_id", hikeId)
    .returns<{ user_id: string; result: AttendanceResult }[]>();

  const marked = new Map((attendance ?? []).map((a) => [a.user_id, a.result]));
  // Снаряжение спрашиваем только про идущих: отменившемуся оно ни к чему, а
  // запрос вырос бы на всех, кто когда-либо передумал.
  const [gaps, strikes] = await Promise.all([
    gearGaps(
      data.filter((row) => row.status !== "cancelled").map((row) => row.user_id),
      category,
    ),
    getStaffStrikes(data.map((row) => row.user_id)),
  ]);

  const entries = data
    .filter((row) => row.profiles !== null)
    .map((row) =>
      toEntry(
        row,
        startsAt,
        marked.get(row.user_id) ?? null,
        gaps.get(row.user_id) ?? null,
        summarizeStrikes(strikes.get(row.user_id) ?? []),
      ),
    );

  // Раскладка — в roster-buckets.ts: там же тесты на снятого со-лидера и
  // на передумавшего, которые ловятся только правилом, а не глазами.
  return bucketRoster(entries);
});

/**
 * Пробелы в снаряжении для всей группы разом.
 *
 * Отдельным запросом, а не через связь в основном select: user_gear висит на
 * profiles, а не на registrations, и вложить её туда значило бы тянуть на
 * каждого человека одиннадцать строк ради двух названий.
 *
 * Ключа в результате нет у того, кто анкету не открывал, — вызывающий
 * превращает это в `null`, то есть «не отвечал», а не «ничего нет».
 */
async function gearGaps(
  userIds: string[],
  category: number,
): Promise<Map<string, RosterGear>> {
  const result = new Map<string, RosterGear>();
  if (userIds.length === 0) return result;

  const supabase = await createClient();
  const [catalogue, { data, error }] = await Promise.all([
    listGear(),
    supabase
      .from("user_gear")
      .select("user_id, gear_id, ownership")
      .in("user_id", userIds)
      .returns<
        { user_id: string; gear_id: string; ownership: GearOwnership }[]
      >(),
  ]);

  if (error) {
    // Снаряжение — не то, ради чего стоит ронять весь ростер: без него экран
    // остаётся полезным, а телефоны и контакты на месте.
    console.error("Не удалось прочитать снаряжение группы", error);
    return result;
  }
  if (catalogue.length === 0) return result;

  const byUser = new Map<string, Map<string, GearOwnership>>();
  for (const row of data) {
    const own = byUser.get(row.user_id) ?? new Map();
    own.set(row.gear_id, row.ownership);
    byUser.set(row.user_id, own);
  }

  for (const [userId, own] of byUser) {
    const items = catalogue.map((item) => ({
      ...item,
      ownership: own.get(item.id) ?? ("none" as GearOwnership),
    }));
    result.set(userId, {
      ...gearGapForCategory(items, category),
      readyUpTo: gearReadyUpTo(items),
      items: items.map((item) => ({
        name: item.name,
        ownership: item.ownership,
      })),
    });
  }

  return result;
}

type RegistrationRow = {
  user_id: string;
  status: RegistrationStatus;
  waitlist_pos: number | null;
  manual_override: boolean;
  as_leader: boolean;
  created_at: string;
  cancelled_at: string | null;
  was_late_cancel: boolean;
  cancelled_by_leader: boolean;
  profiles: {
    full_name: string;
    phone: string | null;
    birth_date: string | null;
    study_year: number | null;
    visited_places: string | null;
    fitness_level: number | null;
    no_show_count: number;
    emergency_contacts: {
      full_name: string;
      phone: string;
      is_parent: boolean;
    }[];
  } | null;
};

function toEntry(
  row: RegistrationRow,
  startsAt: string,
  attendance: AttendanceResult | null,
  gear: RosterGear | null,
  strikes: StrikeSummary,
): RosterEntry {
  const profile = row.profiles!;
  const age = profile.birth_date ? ageOn(profile.birth_date, startsAt) : null;

  return {
    userId: row.user_id,
    fullName: profile.full_name,
    phone: profile.phone,
    studyYear: profile.study_year,
    ageOnHike: age,
    isMinor: age !== null && age < 18,
    status: row.status,
    asLeader: row.as_leader,
    waitlistPos: row.waitlist_pos,
    manualOverride: row.manual_override,
    strikes,
    noShowCount: profile.no_show_count,
    fitnessLevel: profile.fitness_level,
    cancelledAt: row.cancelled_at,
    wasLateCancel: row.was_late_cancel,
    cancelledByLeader: row.cancelled_by_leader,
    visitedPlaces: profile.visited_places,
    attendance,
    gear,
    emergencyContacts: (profile.emergency_contacts ?? []).map((contact) => ({
      fullName: contact.full_name,
      phone: contact.phone,
      isParent: contact.is_parent,
    })),
  };
}
