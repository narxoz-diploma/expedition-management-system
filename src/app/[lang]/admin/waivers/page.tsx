import type { Metadata } from "next";

import { WaiverFormsEditor } from "@/components/waiver-forms-editor";
import { calloutClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth-guards";
import { getWaiverForms } from "@/lib/waiver-forms";

export const metadata: Metadata = {
  title: "Бланки расписки",
  robots: { index: false },
};

/**
 * Бланки расписки — два файла на весь клуб.
 *
 * Отдельный экран, а не блок на странице похода: бланки общие, и место, где
 * их меняют, должно быть одно. Пока они жили у похода, лидер грузил их заново
 * на каждый выход, а забыв — оставлял участника без единого упоминания о
 * бумаге, с которой того на сборе развернут.
 *
 * `requireStaffPage()` вызывается здесь, а не в layout: в App Router страницы
 * рендерятся параллельно, и редирект из layout странице не помеха.
 */
export default async function WaiverFormsPage() {
  await requireStaffPage("/admin/waivers");
  const forms = await getWaiverForms();

  const missing = !forms.adult || !forms.minor;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Бланки расписки</h1>
      {/* Один абзац вместо трёх над двумя полями загрузки. Про два бланка
          сказано прямо: в общем документе они идут подряд, и лидер, не
          разделив их, приложит один и тот же файл дважды. */}
      <p className="mt-3 text-fg-muted">
        Загружаются один раз и стоят на странице каждого похода. Участник видит
        бланк по своему возрасту на день похода: за тех, кому нет 18,
        расписывается родитель.
      </p>

      {missing && (
        <p className={calloutClass({ tone: "warning", className: "mt-6" })}>
          <span className="font-medium text-fg">
            Загружены не оба бланка.
          </span>{" "}
          <span className="text-fg-muted">
            Расписка нужна на каждый поход, и требование участник увидит в
            любом случае — а скачать ему будет нечего.
          </span>
        </p>
      )}

      <WaiverFormsEditor forms={forms} />
    </main>
  );
}
