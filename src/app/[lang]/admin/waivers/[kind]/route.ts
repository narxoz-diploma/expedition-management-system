import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/profile";
import { WAIVER_FORMS_BUCKET, isWaiverKind } from "@/lib/hikes/waiver";
import { createClient } from "@/lib/supabase/server";
import { getWaiverForms } from "@/lib/waiver-forms";

/**
 * Загруженный бланк — посмотреть, что именно лежит на сайте.
 *
 * До 14 сентября 2026 на экране бланков было только «Загружен:
 * adult-6a10c83b-….docx»: служебное имя, и открыть файл было нечем. Проверить,
 * тот ли бланк приложен, лидер мог лишь записавшись на поход.
 *
 * Скачивание участника живёт под походом (`/hikes/[slug]/waiver/[kind]`) —
 * там имя файла несёт имя похода. Здесь похода нет, и адрес свой.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  const back = NextResponse.redirect(new URL("/admin/waivers", request.url));

  const profile = await getCurrentProfile();
  if (profile?.role !== "leader" && profile?.role !== "admin") {
    return NextResponse.redirect(new URL("/login?next=/admin/waivers", request.url));
  }
  if (!isWaiverKind(kind)) return back;

  const path = (await getWaiverForms())[kind];
  if (!path) return back;

  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(WAIVER_FORMS_BUCKET)
    // Латиницей — см. downloadName() у скачивания под походом.
    .createSignedUrl(path, 60, { download: `raspiska-${kind}${ext}` });

  if (error || !data) {
    console.error("Не удалось подписать ссылку на бланк", error);
    return back;
  }

  return NextResponse.redirect(data.signedUrl);
}
