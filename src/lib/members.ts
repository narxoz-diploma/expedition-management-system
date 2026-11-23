import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { MembershipStatus } from "@/lib/profile";

export type MemberApplicant = {
  id: string;
  fullName: string;
  phone: string | null;
  studyYear: number | null;
  membershipStatus: MembershipStatus;
  createdAt: string;
};

/**
 * Заявки и гости.
 *
 * Политики отдают лидеру профили только в статусах guest и pending — ровно те,
 * по которым он принимает решение. Подтверждённых участников с их телефонами
 * этот запрос не видит и видеть не должен.
 */
export const listApplicants = cache(async function listApplicants(): Promise<{
  pending: MemberApplicant[];
  guests: MemberApplicant[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, study_year, membership_status, created_at")
    .in("membership_status", ["pending", "guest"])
    .order("created_at", { ascending: true })
    .returns<
      {
        id: string;
        full_name: string;
        phone: string | null;
        study_year: number | null;
        membership_status: MembershipStatus;
        created_at: string;
      }[]
    >();

  if (error) {
    console.error("Не удалось прочитать заявки", error);
    return { pending: [], guests: [] };
  }

  const mapped = data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    studyYear: row.study_year,
    membershipStatus: row.membership_status,
    createdAt: row.created_at,
  }));

  return {
    pending: mapped.filter((m) => m.membershipStatus === "pending"),
    guests: mapped.filter((m) => m.membershipStatus === "guest"),
  };
});

export type KnownPhone = {
  phone: string;
  note: string | null;
  matched: boolean;
  addedAt: string;
};

export const listKnownPhones = cache(async function listKnownPhones(): Promise<
  KnownPhone[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("known_member_phones")
    .select("phone, note, matched_user_id, added_at")
    .order("added_at", { ascending: false })
    .returns<
      {
        phone: string;
        note: string | null;
        matched_user_id: string | null;
        added_at: string;
      }[]
    >();

  if (error) {
    console.error("Не удалось прочитать список номеров", error);
    return [];
  }

  return data.map((row) => ({
    phone: row.phone,
    note: row.note,
    matched: row.matched_user_id !== null,
    addedAt: row.added_at,
  }));
});

export type InviteCode = {
  id: string;
  code: string;
  label: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
};

export const listInviteCodes = cache(async function listInviteCodes(): Promise<
  InviteCode[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invite_codes")
    .select("id, code, label, expires_at, max_uses, uses")
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        code: string;
        label: string | null;
        expires_at: string | null;
        max_uses: number | null;
        uses: number;
      }[]
    >();

  if (error) {
    console.error("Не удалось прочитать коды", error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
  }));
});
