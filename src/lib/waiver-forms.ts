import { unstable_cache } from "next/cache";
import { cache } from "react";

import { WAIVER_FORMS_TAG } from "@/lib/cache-tags";
import { WAIVER_KINDS, type WaiverKind } from "@/lib/hikes/waiver";
import { createPublicClient } from "@/lib/supabase/public";

/** Пути обоих бланков клуба: null там, где бланк ещё не загружен. */
export type WaiverForms = Record<WaiverKind, string | null>;

const EMPTY: WaiverForms = { adult: null, minor: null };

/**
 * Бланки расписки — два файла на весь клуб.
 *
 * Раньше файлы лежали у похода, и лидер грузил их заново на каждый выход.
 * Довод был записан в миграции 20260812130000 и оказался неверным: бланк
 * универсальный, а название похода и дату участник вписывает сам. Разбор — в
 * миграции 20260829120000.
 *
 * Здесь только пути. Сам файл лежит в закрытом бакете и отдаётся по
 * подписанной ссылке — этим занимается маршрут `/hikes/[slug]/waiver/[kind]`,
 * и там же решается, кому её вообще показывать.
 *
 * Кэшируется на всех сразу: бланки у всех одни и те же, а страницу похода в
 * день набора открывают толпой. Метка сбрасывается при загрузке нового
 * бланка, так что срок здесь — только страховка.
 *
 * Час, а не сутки: при отказе базы сюда возвращается «бланков нет», и этот
 * ответ ложится в кэш наравне с настоящим. Само оно чинится первой же
 * загрузкой бланка — она сбрасывает метку, — но сутки ждать этого не стоит.
 */
const loadWaiverForms = unstable_cache(
  async function loadWaiverForms(): Promise<WaiverForms> {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("waiver_forms")
      .select("kind, path")
      .returns<{ kind: WaiverKind; path: string }[]>();

    if (error) {
      // Пустые бланки — это «ещё не загружены», и на странице так и написано.
      // Правило «без расписки не выпускаем» от этого не зависит: оно живёт в
      // тексте, а не в наличии файла.
      console.error("Не удалось прочитать бланки расписки", error);
      return EMPTY;
    }

    const forms: WaiverForms = { adult: null, minor: null };
    for (const row of data) {
      if (WAIVER_KINDS.includes(row.kind)) forms[row.kind] = row.path;
    }
    return forms;
  },
  ["waiver-forms"],
  { tags: [WAIVER_FORMS_TAG], revalidate: 3600 },
);

export const getWaiverForms = cache(loadWaiverForms);
