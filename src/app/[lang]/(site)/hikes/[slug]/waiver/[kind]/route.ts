import { NextResponse } from "next/server";

import { getHikeBySlug } from "@/lib/hikes/queries";
import { WAIVER_FORMS_BUCKET, isWaiverKind } from "@/lib/hikes/waiver";
import { createClient } from "@/lib/supabase/server";
import { getWaiverForms } from "@/lib/waiver-forms";

/**
 * Скачивание бланка расписки.
 *
 * Обычная ссылка, а не кнопка с клиентским кодом: во встроенном браузере
 * WhatsApp — а это основной путь новичка — скрипты подводят чаще, чем
 * переход по адресу.
 *
 * Бакет закрытый, поэтому здесь выдаётся подписанная ссылка на минуту.
 * Читать из него может любой вошедший: бланк общий на клуб, и привязать его
 * к «идёт хоть куда-нибудь» политика не может. Границу «показываем только
 * тем, кто идёт» держит страница похода, а не бакет.
 *
 * Адрес остался под походом, хотя файл общий: так у скачанного файла в
 * «Загрузках» остаётся имя похода — а человек как раз вписывает в бланк, на
 * какой выход он идёт.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; kind: string }> },
) {
  const { slug, kind } = await params;
  const back = NextResponse.redirect(new URL(`/hikes/${slug}`, request.url));

  if (!isWaiverKind(kind)) return back;

  const hike = await getHikeBySlug(slug);
  if (!hike) return back;

  const path = (await getWaiverForms())[kind];
  if (!path) return back;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(WAIVER_FORMS_BUCKET)
    .createSignedUrl(path, 60, { download: downloadName(slug, kind, path) });

  if (error || !data) {
    console.error("Не удалось подписать ссылку на расписку", error);
    return back;
  }

  return NextResponse.redirect(data.signedUrl);
}

/**
 * Имя файла на телефоне человека — латиницей.
 *
 * Кириллица в заголовке Content-Disposition требует отдельного кодирования,
 * а промах там означает файл с именем из вопросительных знаков в папке
 * «Загрузки». Адрес похода латинский по построению — его и берём.
 */
function downloadName(slug: string, kind: string, path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return `raspiska-${slug}-${kind}${ext}`;
}
