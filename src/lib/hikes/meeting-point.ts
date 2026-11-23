import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type MeetingPoint = {
  /**
   * Показывать ли адрес этому человеку. Не то же самое, что «адрес пустой»:
   * лидер мог его не заполнить, и тогда предлагать записаться незачем.
   */
  visible: boolean;
  point: string | null;
  url: string | null;
};

const HIDDEN: MeetingPoint = { visible: false, point: null, url: null };

type Row = {
  visible: boolean;
  meeting_point: string | null;
  meeting_point_url: string | null;
};

/**
 * Место сбора похода — или отказ.
 *
 * Отдельным запросом, а не колонкой в HIKE_COLUMNS: права на эти две колонки
 * у клиента отобраны миграцией 20260812, и обычный select по ним падает с
 * permission denied. Решает не этот модуль, а база — здесь только вызов.
 */
export const getMeetingPoint = cache(async function getMeetingPoint(
  hikeId: string,
): Promise<MeetingPoint> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hike_meeting_point", {
    p_hike_id: hikeId,
  });

  // Отказ трактуем как «не показывать»: адрес — ровно то, ради чего вся
  // проверка, и показать его на сбое было бы хуже, чем не показать вовсе.
  if (error) {
    console.error("Не удалось получить место сбора", error);
    return HIDDEN;
  }

  // Приведение руками: типы БД не сгенерированы, и rpc отдаёт неизвестное.
  // Функция возвращает набор строк — для существующего похода ровно одну.
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return HIDDEN;

  return {
    visible: rows[0].visible,
    point: rows[0].meeting_point,
    url: rows[0].meeting_point_url,
  };
});
