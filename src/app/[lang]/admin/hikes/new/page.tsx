import { BackLink } from "@/components/back-link";
import { HikeForm } from "@/components/hike-form";
import { requireStaffPage } from "@/lib/auth-guards";
import { utcIsoToClubLocal } from "@/lib/hikes/datetime";

export const metadata = { title: "Новый поход" };

/** Ближайшая суббота, 07:00 — типичный выход клуба. Лидеру остаётся поправить. */
function defaultStart(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7 || 7));
  date.setUTCHours(2, 0, 0, 0); // 07:00 по Алматы
  return utcIsoToClubLocal(date.toISOString());
}

export default async function NewHikePage() {
  // См. комментарий в /admin/hikes: layout не останавливает рендер страницы.
  await requireStaffPage("/admin/hikes/new");

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink href="/admin/hikes">Походы</BackLink>

      <h1 className="mt-6 text-2xl font-bold">Новый поход</h1>

      <HikeForm
        hike={null}
        startsAtLocal={defaultStart()}
        registrationOpensAtLocal=""
        registrationClosesAtLocal=""
        meetingPoint=""
        meetingPointUrl=""
      />
    </main>
  );
}
