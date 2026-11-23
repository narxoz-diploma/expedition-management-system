"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { canEditHikeNow, ForbiddenError, requireStaff } from "@/lib/auth-guards";
import { LANDING_STATS_TAG } from "@/lib/cache-tags";
import { dbErrorMessage } from "@/lib/db-errors";
import { clubLocalToUtcIso } from "@/lib/hikes/datetime";
import { getHikeById } from "@/lib/hikes/queries";
import { buildHikeSlug } from "@/lib/hikes/slug";
import type { HikeStatus } from "@/lib/hikes/types";
import {
  collectFieldErrors,
  hikeInputSchema,
  type FieldErrors,
} from "@/lib/hikes/validation";
import { createClient } from "@/lib/supabase/server";
import { parseRoutePoint } from "@/lib/weather/coords";
import { revalidateLocalized } from "@/lib/i18n/server";

export type HikeFormState = {
  errors?: FieldErrors;
  message?: string;
};

function refreshHikeViews(slug?: string) {
  revalidateLocalized("/hikes");
  revalidateLocalized("/admin/hikes");
  if (slug) revalidateLocalized(`/hikes/${slug}`);
  // Публикация, отмена и правка набора высоты меняют цифры на лендинге, а они
  // живут в своём кэше, общем на всех гостей разом.
  updateTag(LANDING_STATS_TAG);
}

/**
 * Создание и редактирование похода.
 *
 * Одно действие на оба случая: поля и проверки совпадают полностью, а два
 * почти одинаковых обработчика разъезжаются при первой же правке формы.
 */
export async function saveHike(
  hikeId: string | null,
  _prevState: HikeFormState,
  formData: FormData,
): Promise<HikeFormState> {
  let profile;
  try {
    profile = await requireStaff();
  } catch (error) {
    if (error instanceof ForbiddenError) return { message: error.message };
    throw error;
  }

  const parsed = hikeInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      errors: collectFieldErrors(parsed.error),
      message: "Проверь выделенные поля",
    };
  }
  const input = parsed.data;

  const startsAt = clubLocalToUtcIso(input.startsAtLocal);
  // Разбор второй раз: схема уже проверила, что строка разбирается, но
  // отдала её сырой — так ошибка достаётся форме привязанной к полю.
  const routePoint = input.routePoint ? parseRoutePoint(input.routePoint) : null;

  const row = {
    title: input.title,
    route_name: input.routeName,
    summary: input.summary,
    description: input.description,
    category: input.category,
    distance_km: input.distanceKm,
    elevation_gain_m: input.elevationGainM,
    duration_hours: input.durationHours,
    starts_at: startsAt,
    meeting_point: input.meetingPoint,
    meeting_point_url: input.meetingPointUrl,
    registration_opens_at: input.registrationOpensAtLocal
      ? clubLocalToUtcIso(input.registrationOpensAtLocal)
      : null,
    registration_closes_at: input.registrationClosesAtLocal
      ? clubLocalToUtcIso(input.registrationClosesAtLocal)
      : null,
    route_lat: routePoint?.lat ?? null,
    route_lon: routePoint?.lon ?? null,
    // Высота без точки бессмысленна и отбивается констрейнтом в базе —
    // обнуляем вместе с точкой, а не тащим осиротевшее число.
    route_altitude_m: routePoint ? input.routeAltitudeM : null,
    capacity: input.capacity,
    open_to_newcomers: input.openToNewcomers,
    cost_amount: input.costAmount,
    cost_note: input.costNote,
  };

  const supabase = await createClient();
  let slug: string;
  let targetId: string;

  if (hikeId) {
    const existing = await getHikeById(hikeId);
    if (!existing) return { message: "Поход не найден" };
    if (!(await canEditHikeNow(profile, existing))) {
      return { message: "Это чужой поход — править может только его лидер" };
    }

    // Адрес не меняем: он уже разошёлся по чату, и старые ссылки должны
    // продолжать работать даже если лидер переименовал поход.
    slug = existing.slug;
    targetId = hikeId;
    const { error } = await supabase
      .from("hikes")
      .update(row)
      .eq("id", hikeId);
    if (error) {
      console.error("Не удалось сохранить поход", error);
      return { message: "Не удалось сохранить. Попробуй ещё раз." };
    }
  } else {
    slug = await uniqueSlug(buildHikeSlug(input.title, startsAt));
    // Идентификатор задаём сами, а не читаем из ответа вставки: возврат
    // строки требует права её прочитать, а в состав лидеров автора добавляет
    // триггер уже после вставки. Адрес же нужен для перехода в группу.
    targetId = crypto.randomUUID();
    const { error } = await supabase.from("hikes").insert({
      ...row,
      id: targetId,
      slug,
      status: "draft" satisfies HikeStatus,
      leader_id: profile.id,
    });
    if (error) {
      console.error("Не удалось создать поход", error);
      return { message: "Не удалось создать поход. Попробуй ещё раз." };
    }
  }

  refreshHikeViews(slug);
  revalidateLocalized(`/admin/hikes/${targetId}`);
  // В группу похода, а не в общий список: до 14 сентября 2026 лидер,
  // поправивший время сбора с экрана группы, после «Сохранить» искал поход
  // в списке заново. Новый черновик тоже открывается там — оттуда его и
  // публикуют.
  redirect(`/admin/hikes/${targetId}`);
}

/**
 * Свободный адрес: к занятому дописывается номер.
 *
 * Обычно достаточно названия и даты, но два похода в один день на один
 * маршрут — это не ошибка, а две группы, и падать на этом нельзя.
 */
async function uniqueSlug(base: string): Promise<string> {
  const supabase = await createClient();
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await supabase
      .from("hikes")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function setStatus(
  hikeId: string,
  status: HikeStatus,
  /**
   * Из каких статусов переход разрешён. Обязательный: кнопка в строке списка
   * предлагала «Опубликовать» прошедшему походу (баг 14 сентября 2026), и
   * одно нажатие сняло бы с него «прошёл», от которого считается членство.
   * Необязательный аргумент в гарде — приглашение его забыть.
   */
  allowedFrom: readonly HikeStatus[],
  extra: Record<string, unknown> = {},
): Promise<{ message?: string }> {
  const profile = await requireStaff();
  const hike = await getHikeById(hikeId);
  if (!hike) return { message: "Поход не найден" };
  if (!(await canEditHikeNow(profile, hike))) {
    return { message: "Это чужой поход" };
  }
  if (!allowedFrom.includes(hike.status)) {
    return { message: "Статус похода уже изменился — обнови страницу." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("hikes")
    .update({ status, ...extra })
    .eq("id", hikeId);

  if (error) {
    console.error("Не удалось изменить статус похода", error);
    return { message: "Не удалось изменить статус" };
  }

  refreshHikeViews(hike.slug);
  revalidateLocalized(`/admin/hikes/${hikeId}`);
  return {};
}

export async function publishHike(hikeId: string) {
  return setStatus(hikeId, "published", ["draft"]);
}

/** Снятие с публикации: поход возвращается в черновики. */
export async function unpublishHike(hikeId: string) {
  return setStatus(hikeId, "draft", ["published"]);
}

export async function cancelHike(hikeId: string, reason: string) {
  return setStatus(hikeId, "cancelled", ["published"], {
    cancelled_reason: reason.trim() || null,
  });
}

/**
 * Удаление черновика — автором или админом, пока на поход никто не
 * записывался и у него нет фотографий. Все условия проверяет база
 * (delete_draft_hike): прямого права удалять поход у лидера нет.
 */
export async function deleteDraftHike(
  hikeId: string,
): Promise<{ message?: string }> {
  try {
    await requireStaff();
  } catch (error) {
    if (error instanceof ForbiddenError) return { message: error.message };
    throw error;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_draft_hike", { p_hike_id: hikeId });

  if (error) {
    console.error("Не удалось удалить черновик", error);
    return { message: dbErrorMessage(error) };
  }

  refreshHikeViews();
  redirect("/admin/hikes");
}
