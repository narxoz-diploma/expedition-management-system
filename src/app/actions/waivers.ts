"use server";

import { updateTag } from "next/cache";

import { requireStaff } from "@/lib/auth-guards";
import { WAIVER_FORMS_TAG } from "@/lib/cache-tags";
import { WAIVER_FORMS_BUCKET, type WaiverKind } from "@/lib/hikes/waiver";
import { getWaiverForms } from "@/lib/waiver-forms";
import { createClient } from "@/lib/supabase/server";
import { revalidateLocalized } from "@/lib/i18n/server";

export type WaiverActionState = { message?: string; ok?: boolean };

/**
 * Заменить клубный бланк.
 *
 * Файл уже в хранилище — сюда приходит только путь. Тот же порядок, что у
 * снимков: файл идёт из браузера прямо в Storage, а server action пишет
 * строку. Права на файл стережёт политика бакета, права на действие —
 * `requireStaff()` (правило 5 из CLAUDE.md).
 *
 * Проверки «твой ли это поход» здесь больше нет и быть не может: бланк
 * общий на клуб. Меняет его любой лидер — бланк трогают раз в год, и упирать
 * это в одного человека значит однажды ждать его из отпуска.
 */
export async function setWaiverForm(
  kind: WaiverKind,
  path: string,
): Promise<WaiverActionState> {
  const profile = await requireStaff();
  const previous = (await getWaiverForms())[kind];

  const supabase = await createClient();
  const { error } = await supabase
    .from("waiver_forms")
    .upsert(
      { kind, path, uploaded_by: profile.id, updated_at: new Date().toISOString() },
      { onConflict: "kind" },
    );

  if (error) {
    console.error("Не удалось записать бланк расписки", error);
    return { message: "Файл загрузился, но не записался. Обнови страницу" };
  }

  // Прежний файл убираем после того, как новый записан: обратный порядок
  // оставил бы клуб без бланка, если запись не прошла.
  if (previous && previous !== path) {
    const { error: storageError } = await supabase.storage
      .from(WAIVER_FORMS_BUCKET)
      .remove([previous]);
    if (storageError) {
      console.error("Новый бланк записан, старый файл остался", storageError);
    }
  }

  refresh();
  return { ok: true };
}

/** Убрать бланк: сначала строка, потом файл — как у снимков. */
export async function removeWaiverForm(
  kind: WaiverKind,
): Promise<WaiverActionState> {
  await requireStaff();
  const path = (await getWaiverForms())[kind];
  if (!path) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("waiver_forms")
    .delete()
    .eq("kind", kind);

  if (error) {
    console.error("Не удалось убрать бланк расписки", error);
    return { message: "Не получилось убрать бланк" };
  }

  const { error: storageError } = await supabase.storage
    .from(WAIVER_FORMS_BUCKET)
    .remove([path]);
  if (storageError) {
    // Со страницы бланк уже исчез. Осиротевший файл в закрытом бакете не
    // виден никому и стоит копейки — это забота уборки, а не лидера.
    console.error("Строка очищена, файл остался", storageError);
  }

  refresh();
  return { ok: true };
}

/**
 * Бланк стоит на каждой странице похода, а их много и адреса разные —
 * перечислить пути нельзя. Поэтому сброс идёт меткой: пути бланков лежат в
 * своём кэше, общем на всех, и `revalidatePath` его не трогает.
 */
function refresh() {
  updateTag(WAIVER_FORMS_TAG);
  revalidateLocalized("/admin/waivers");
}
