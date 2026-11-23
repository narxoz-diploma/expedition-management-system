"use server";


import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale, revalidateLocalized } from "@/lib/i18n/server";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export type TeamCardState = { ok?: boolean; message?: string };

const BIO_MAX = 300;

/**
 * «О себе» и инстаграм — своя карточка на странице команды.
 *
 * Поле `bio` было в схеме с первой миграции и показывалось на лендинге, но
 * заполнить его было негде: только руками в SQL, поэтому оно пустовало у
 * всех (замечание автора, 14 сентября 2026). Роль и порядок в команде
 * по-прежнему правятся в SQL — это решение клуба, а не самого человека.
 *
 * Только лидерам и админу: на страницу команды попадают только они, и
 * гостю поле «о себе» показывать негде.
 *
 * Текст «о себе» — слова самого лидера, на любом языке страницы он такой, как
 * написан; переводятся только сообщения формы.
 */
export async function saveTeamCard(
  _prev: TeamCardState,
  formData: FormData,
): Promise<TeamCardState> {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  const t = getDictionary(locale).profileActions;
  if (!profile) return { message: t.sessionExpired };
  if (profile.role !== "leader" && profile.role !== "admin") {
    return { message: t.teamLeadersOnly };
  }

  const bio = String(formData.get("bio") ?? "").trim();
  if (bio.length > BIO_MAX) {
    return { message: fill(t.teamTooLong, { max: BIO_MAX, n: bio.length }) };
  }

  // Принимаем ник в любом виде, в каком его копируют: «@nick»,
  // «instagram.com/nick», целая ссылка с параметрами. Храним голый ник — так
  // требует ограничение в базе (profiles_instagram_handle).
  const rawInstagram = String(formData.get("instagram") ?? "").trim();
  const instagram = rawInstagram
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
    return { message: t.teamBadInstagram };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ bio: bio || null, instagram: instagram || null })
    .eq("id", profile.id)
    // Политика запрещает запись не ошибкой, а нулём строк — проверяем явно.
    .select("id");

  if (error || !data || data.length === 0) {
    console.error("Не удалось сохранить карточку в команде", error);
    return { message: t.saveFailed };
  }

  // Лендинг и страница команды этот блок не кэшируют (см. club-stats.ts),
  // сбрасываем только отрисованные страницы.
  revalidateLocalized("/team");
  revalidateLocalized("/");
  revalidateLocalized("/profile");
  return { ok: true, message: t.teamSaved };
}
