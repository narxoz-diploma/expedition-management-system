"use server";

import { redirect } from "next/navigation";

import { collectFieldErrors, type FieldErrors } from "@/lib/hikes/validation";
import { getCurrentProfile, getEmergencyContacts } from "@/lib/profile";
import {
  AVATARS_BUCKET,
  avatarPathFromUrl,
  publicUrl,
} from "@/lib/photos/paths";
import { profileInputSchemaFor } from "@/lib/profile-validation";
import { supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale, revalidateLocalized } from "@/lib/i18n/server";

export type ProfileFormState = {
  errors?: FieldErrors;
  message?: string;
};

/**
 * Сохранение мини-профиля.
 *
 * Куда вернуть человека после сохранения, решает вызывающая страница: чаще
 * всего он попал сюда с карточки похода, на полпути к записи, и возвращать
 * его в профиль вместо похода значит потерять его на ровном месте.
 */
export async function saveProfile(
  next: string,
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  // Язык — из заголовка proxy: форма отправляется на адрес страницы профиля.
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  const t = getDictionary(locale).profileActions;
  if (!profile) return { message: t.sessionExpired };

  const parsed = profileInputSchemaFor(locale).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      errors: collectFieldErrors(parsed.error),
      message: t.checkFields,
    };
  }
  const input = parsed.data;

  const supabase = await createClient();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName,
      phone: input.phone,
      birth_date: input.birthDate,
      study_year: input.studyYear,
      visited_places: input.visitedPlaces,
      fitness_level: input.fitnessLevel,
      // Дату согласия не перезаписываем: важно, когда его дали впервые.
      consent_pd_at: profile.consentAt ?? new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (profileError) {
    // Уникальный индекс на телефоне: номер уже привязан к другому профилю.
    if (profileError.code === "23505") {
      return {
        errors: { phone: t.phoneTaken },
      };
    }
    console.error("Не удалось сохранить профиль", profileError);
    return { message: t.saveFailed };
  }

  // Экстренный контакт: один, первый. Правим существующий, а не плодим новые
  // при каждом сохранении формы.
  const existing = await getEmergencyContacts();
  const contactRow = {
    user_id: profile.id,
    full_name: input.emergencyName,
    phone: input.emergencyPhone,
    is_parent: input.emergencyIsParent,
  };

  // Условие по user_id — не лишнее рядом с id строки, а страховка от
  // повторения уже случившегося: getEmergencyContacts() однажды вернула
  // чужие строки, и правка уходила в чужую. Политика ec_owner такую запись
  // не пропускает, но отвечает не ошибкой, а нулём изменённых строк, — и
  // человек видел «сохранено» там, где не сохранилось ничего.
  const { error: contactError } = existing[0]
    ? await supabase
        .from("emergency_contacts")
        .update(contactRow)
        .eq("id", existing[0].id)
        .eq("user_id", profile.id)
    : await supabase.from("emergency_contacts").insert(contactRow);

  if (contactError) {
    console.error("Не удалось сохранить экстренный контакт", contactError);
    return { message: t.contactFailed };
  }

  revalidateLocalized("/profile");
  revalidateLocalized("/", "layout");
  redirect(next);
}

/**
 * Аватар: путь уже в хранилище, сюда приходит только он.
 *
 * Проверка «свой ли путь» здесь не лишняя, хотя политика на storage.objects
 * и так не даст записать чужой файл: строку в profiles правит эта функция, и
 * без проверки можно было бы прописать себе чужой аватар, ничего не загружая.
 */
export async function saveAvatar(path: string): Promise<{ message?: string }> {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  const t = getDictionary(locale).profileActions;
  if (!profile) return { message: t.sessionExpired };

  if (path.split("/")[0] !== profile.id) {
    return { message: t.avatarForeign };
  }

  const supabase = await createClient();
  const url = publicUrl(supabaseUrl(), AVATARS_BUCKET, path);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", profile.id);

  if (error) {
    console.error("Не удалось сохранить аватар", error);
    return { message: t.avatarSaveFailed };
  }

  // Прежний файл убираем только если он наш: у большинства в avatar_url
  // лежит ссылка на Google, и удалять по ней нечего.
  const old = profile.avatarUrl ? avatarPathFromUrl(profile.avatarUrl) : null;
  if (old && old !== path) {
    const { error: removeError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .remove([old]);
    if (removeError) {
      // Не сообщаем: человек своё фото уже поменял, а мусор в хранилище —
      // не его забота.
      console.error("Старый аватар остался в хранилище", removeError);
    }
  }

  revalidateLocalized("/profile");
  revalidateLocalized("/");
  return {};
}
