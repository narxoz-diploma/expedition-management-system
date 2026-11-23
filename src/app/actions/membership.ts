"use server";

import { updateTag } from "next/cache";

import { LANDING_STATS_TAG } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/db-errors";
import { normalizePhone } from "@/lib/phone";
import { getCurrentProfile, type MembershipStatus } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locales";
import { getLocale, revalidateLocalized } from "@/lib/i18n/server";

export type ActionResult = {
  ok: boolean;
  message?: string;
};

/** Погашение кода семестра участником. */
export async function redeemInviteCode(code: string): Promise<ActionResult> {
  // Язык — из заголовка proxy: действие отправляется со страницы /…/profile/join.
  const locale = await getLocale();
  const t = getDictionary(locale).membershipActions;

  const trimmed = code.trim();
  if (!trimmed) return { ok: false, message: t.enterCode };

  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_invite_code", {
    p_code: trimmed,
  });

  if (error) {
    return { ok: false, message: codeErrorMessage(error, t, locale) };
  }

  revalidateLocalized("/profile");
  revalidateLocalized("/", "layout");
  // «Нас уже N» на лендинге считается в кэше, общем на всех.
  updateTag(LANDING_STATS_TAG);
  return { ok: true, message: t.joined };
}

/** Коды приходят своими ошибками — их стоит различать, причины разные. */
function codeErrorMessage(
  error: unknown,
  t: Dictionary["membershipActions"],
  locale: Locale,
): string {
  const raw = String(
    typeof error === "object" && error && "message" in error
      ? (error as { message: unknown }).message
      : error,
  );
  if (raw.includes("INVALID_CODE")) return t.invalidCode;
  if (raw.includes("CODE_EXPIRED")) return t.expiredCode;
  if (raw.includes("CODE_EXHAUSTED")) return t.exhaustedCode;
  return dbErrorMessage(error, locale);
}

/** Заявка на подтверждение — для тех, у кого нет ни кода, ни номера в списке. */
export async function requestMembership(): Promise<ActionResult> {
  const locale = await getLocale();
  const t = getDictionary(locale).membershipActions;

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_membership");

  if (error) {
    const raw = String(error.message);
    if (raw.includes("NOTHING_TO_REQUEST")) {
      return { ok: false, message: t.alreadyApplied };
    }
    return { ok: false, message: dbErrorMessage(error, locale) };
  }

  revalidateLocalized("/profile");
  revalidateLocalized("/profile/join");
  return { ok: true, message: t.applied };
}

/** Решение лидера по конкретному человеку. */
export async function setMembershipStatus(
  userId: string,
  status: MembershipStatus,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_membership_status", {
    p_user_id: userId,
    p_status: status,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidateLocalized("/admin/members");
  updateTag(LANDING_STATS_TAG);
  return { ok: true };
}

export type PhoneImportResult = ActionResult & {
  added?: number;
  matchedNow?: number;
  rejected?: string[];
};

/**
 * Вставка списка номеров из WhatsApp-группы.
 *
 * Принимаем текст как есть — из группы номера копируются в десятке видов,
 * с именами, переносами и скобками. Нормализуем и молча пропускаем строки,
 * не похожие на номер, но показываем, что именно не разобрали: иначе лидер
 * решит, что вставились все, а на деле половина отвалилась.
 */
export async function importMemberPhones(
  raw: string,
  note: string,
): Promise<PhoneImportResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "participant") {
    return { ok: false, message: "Недостаточно прав." };
  }

  const chunks = raw
    .split(/[\n,;]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const phones: string[] = [];
  const rejected: string[] = [];

  for (const chunk of chunks) {
    // В строке может быть имя рядом с номером — вытаскиваем похожее на номер.
    const candidate = chunk.match(/[+\d][\d\s()\-]{8,}/)?.[0] ?? chunk;
    const normalized = normalizePhone(candidate);
    if (normalized) phones.push(normalized);
    else rejected.push(chunk.slice(0, 40));
  }

  if (phones.length === 0) {
    return {
      ok: false,
      message: "Не нашли ни одного номера. Проверь, что вставил телефоны.",
      rejected,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("add_known_member_phones", {
      p_phones: phones,
      p_note: note.trim() || null,
    })
    .single<{ added: number; matched_now: number }>();

  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidateLocalized("/admin/members");
  updateTag(LANDING_STATS_TAG);
  return {
    ok: true,
    added: data.added,
    matchedNow: data.matched_now,
    rejected,
  };
}

/** Код семестра. Создаётся лидером, публикуется в группе. */
export async function createInviteCode(
  code: string,
  label: string,
  expiresAt: string,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "participant") {
    return { ok: false, message: "Недостаточно прав." };
  }

  const trimmed = code.trim();
  if (trimmed.length < 4) {
    return { ok: false, message: "Код короче четырёх знаков подобрать слишком легко." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("invite_codes").insert({
    code: trimmed,
    label: label.trim() || null,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    created_by: profile.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "Такой код уже есть." };
    }
    return { ok: false, message: dbErrorMessage(error) };
  }

  revalidateLocalized("/admin/members");
  return { ok: true };
}
