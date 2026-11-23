import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type UserRole = "participant" | "leader" | "admin";
import { fullNameProblem } from "@/lib/full-name";

export type MembershipStatus = "guest" | "pending" | "member" | "alumni";

export type EmergencyContact = {
  id: string;
  fullName: string;
  phone: string;
  relation: string | null;
  isParent: boolean;
};

export type CurrentProfile = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  membershipStatus: MembershipStatus;

  phone: string | null;
  birthDate: string | null;
  faculty: string | null;
  studyYear: number | null;
  consentAt: string | null;

  /**
   * Где человек уже был — своими словами, про опыт до клуба. Пройденное с
   * клубом сайт знает и так; этого он не знает ниоткуда.
   */
  visitedPlaces: string | null;

  /**
   * Самооценка формы, 1–3. Информационное, не допуск: подписи в
   * `lib/fitness.ts`, там же довод про три ступени.
   */
  fitnessLevel: number | null;

  lateCancelCount: number;
  noShowCount: number;

  /** Запись на походы закрыта. Причину сюда не тянем: она не для показа. */
  banned: boolean;
};

// TODO: заменить на типы, сгенерированные из Supabase
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
// Пока описано руками только то, что реально читается, — чтобы не разошлось
// со схемой незаметно на большом файле.
type ProfileRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  membership_status: MembershipStatus;
  phone: string | null;
  birth_date: string | null;
  faculty: string | null;
  study_year: number | null;
  consent_pd_at: string | null;
  visited_places: string | null;
  fitness_level: number | null;
  late_cancel_count: number;
  no_show_count: number;
  banned_at: string | null;
};

const PROFILE_COLUMNS =
  "id, full_name, avatar_url, role, membership_status, phone, birth_date, " +
  "faculty, study_year, consent_pd_at, visited_places, fitness_level, " +
  "late_cancel_count, no_show_count, banned_at";

/**
 * Профиль текущего пользователя или null, если он не вошёл.
 *
 * Строку профиля создаёт триггер в базе при первом входе, поэтому её
 * отсутствие — это не «ещё не завёл», а сбой: такое надо видеть, а не
 * молча показывать пустую шапку.
 *
 * Обёрнуто в cache(): профиль спрашивают и шапка, и сама страница, а это один
 * и тот же рендер одного и того же запроса. Без обёртки — два похода в базу
 * вместо одного, и дальше по одному на каждый новый компонент.
 */
export const getCurrentProfile = cache(
  async function getCurrentProfile(): Promise<CurrentProfile | null> {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (error) {
      console.error("Не удалось прочитать профиль", error);
      return null;
    }
    if (!data) return null;

    return {
      id: data.id,
      fullName: data.full_name,
      avatarUrl: data.avatar_url,
      role: data.role,
      membershipStatus: data.membership_status,
      phone: data.phone,
      birthDate: data.birth_date,
      faculty: data.faculty,
      studyYear: data.study_year,
      consentAt: data.consent_pd_at,
      visitedPlaces: data.visited_places,
      fitnessLevel: data.fitness_level,
      lateCancelCount: data.late_cancel_count,
      noShowCount: data.no_show_count,
      banned: data.banned_at !== null,
    };
  },
);

/**
 * Свои экстренные контакты — и только свои.
 *
 * Фильтр по user_id обязателен, хотя политики на таблице есть. RLS — это
 * потолок, а не фильтр: ec_leader_read разрешает лидеру читать контакты
 * своей группы, и запрос без условия отдавал ему всю группу разом. Дальше
 * страница профиля брала первый попавшийся, отсортированный по дате, и
 * показывала лидеру чужой контакт как его собственный, а форма правки
 * пыталась записать его же — и молча не записывала ничего, потому что
 * ec_owner чужую строку менять не даёт.
 */
export const getEmergencyContacts = cache(
  async function getEmergencyContacts(): Promise<EmergencyContact[]> {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("emergency_contacts")
      .select("id, full_name, phone, relation, is_parent")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .returns<
        {
          id: string;
          full_name: string;
          phone: string;
          relation: string | null;
          is_parent: boolean;
        }[]
      >();

    if (error) {
      console.error("Не удалось прочитать экстренные контакты", error);
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      relation: row.relation,
      isParent: row.is_parent,
    }));
  },
);

/**
 * Чего не хватает профилю для записи в поход.
 *
 * Повторяет условие функции profile_is_complete() в базе. Дублирование
 * намеренное: база отвечает «нельзя» кодом PROFILE_INCOMPLETE, а человеку надо
 * показать, какое именно поле открыть. Проверка здесь — для подсказки,
 * решение всё равно за базой.
 */
export type MissingField =
  | "signIn"
  | "fullName"
  | "phone"
  | "birthDate"
  | "fitness"
  | "emergencyContact"
  | "consent";

/**
 * То же, но ключами, а не словами: подпись к полю берётся из словаря языка
 * (`profileFields`). Слова здесь были бы русскими на любом языке.
 */
export function missingFieldKeys(
  profile: CurrentProfile | null,
  contacts: EmergencyContact[],
): MissingField[] {
  if (!profile) return ["signIn"];

  const missing: MissingField[] = [];
  // Первым: ник из Google вместо имени — то, что лидер увидит в списке
  // группы раньше всего остального. База этого не проверяет
  // (profile_is_complete), поэтому уже заведённые профили просим поправить
  // здесь, при записи, а не ломаем им вход.
  if (fullNameProblem(profile.fullName)) missing.push("fullName");
  if (!profile.phone) missing.push("phone");
  if (!profile.birthDate) missing.push("birthDate");
  if (!profile.fitnessLevel) missing.push("fitness");
  // Свой же номер в контакте — всё равно что пустой: с маршрута лидер
  // позвонит тому, с кем беда. База считает так же (profile_is_complete,
  // миграция 20260923130000), здесь — чтобы сказать до нажатия.
  if (!contacts.some((contact) => contact.phone !== profile.phone)) {
    missing.push("emergencyContact");
  }
  if (!profile.consentAt) missing.push("consent");
  return missing;
}

const RU_FIELD_LABELS: Record<MissingField, string> = {
  signIn: "вход",
  fullName: "имя и фамилию",
  phone: "телефон",
  birthDate: "дату рождения",
  fitness: "физическую форму",
  emergencyContact: "контакт близкого человека",
  consent: "согласие на обработку данных",
};

/** Русскими словами — для мест, которые ещё не переведены на другие языки. */
export function missingForRegistration(
  profile: CurrentProfile | null,
  contacts: EmergencyContact[],
): string[] {
  return missingFieldKeys(profile, contacts).map((key) => RU_FIELD_LABELS[key]);
}

/**
 * Возраст на дату похода — по нему определяется и согласие родителя, и бланк
 * расписки. Живёт в `profile-age.ts`: там нет импортов приложения, и модуль
 * берут тесты. Здесь — реэкспорт, чтобы места вызова не переучивать.
 */
export { ageOn } from "@/lib/profile-age";
