"use server";

import { z } from "zod";

import type { GearOwnership } from "@/lib/gear-readiness";
import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale, revalidateLocalized } from "@/lib/i18n/server";

const ownershipSchema = z.enum(["own", "will_get", "none"]);

/**
 * Одна отметка снаряжения — сразу по нажатию.
 *
 * До 14 сентября 2026 весь набор сохранялся одной кнопкой в самом низу:
 * пятнадцать вещей по три варианта, и тот, кто ушёл, не долистав, терял все
 * отметки молча. Тогда же отказались от сохранения по нажатию — «часть
 * запросов на мобильном интернете потеряется молча». Молча — только если
 * этого не показывать: теперь у каждой вещи свой ответ, и несохранённая
 * отметка возвращается назад с просьбой нажать ещё раз.
 */
export async function setGearItem(
  gearId: string,
  ownership: GearOwnership,
): Promise<{ message?: string }> {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  const t = getDictionary(locale).gearActions;
  if (!profile) return { message: t.sessionExpired };

  // Идентификатор приходит от клиента. Проверяем формат, иначе база отобьёт
  // по внешнему ключу, но с невнятной ошибкой.
  if (!z.uuid().safeParse(gearId).success) return { message: t.noItem };
  const parsed = ownershipSchema.safeParse(ownership);
  if (!parsed.success) return { message: t.badMark };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_gear")
    .upsert(
      { user_id: profile.id, gear_id: gearId, ownership: parsed.data },
      { onConflict: "user_id,gear_id" },
    );

  if (error) {
    console.error("Не удалось сохранить снаряжение", error);
    return { message: t.saveFailed };
  }

  revalidateLocalized("/profile/gear");
  revalidateLocalized("/profile");
  return {};
}
