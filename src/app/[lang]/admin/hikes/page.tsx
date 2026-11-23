import Link from "@/components/link";

import { HikeAdminRow } from "@/components/hike-admin-row";
import { buttonClass, cardClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth-guards";
import { formatDateTime } from "@/lib/hikes/format";
import { listAllHikes } from "@/lib/hikes/queries";
import { hubPhase } from "@/lib/hikes/hub-phase";
import { isPastHike, type Hike } from "@/lib/hikes/types";

export const metadata = { title: "Походы — управление" };

export default async function AdminHikesPage() {
  // Проверка обязана быть здесь, а не только в layout: layout и page
  // рендерятся параллельно, и redirect из layout не мешает странице
  // отрендериться целиком и уехать в теле ответа 307.
  await requireStaffPage("/admin/hikes");

  const hikes = await listAllHikes();
  const now = new Date();

  // Впереди — ближайший сверху. До 14 сентября 2026 весь список шёл по
  // убыванию даты, и поход через месяц стоял над тем, что в эти выходные.
  // Черновики — к будущим, даже если дата в прошлом: их дело — публикация.
  //
  // Идущий сбор — тоже к будущим: два часа после старта лидер ещё отмечает
  // опоздавших (GATHERING_GRACE_MS), и звать его к итогу рано.
  const ahead = (hike: Hike) =>
    hike.status === "draft" ||
    !isPastHike(hike, now) ||
    hubPhase(hike, now) === "departure";
  const upcoming = hikes
    .filter(ahead)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  // Прошедшие — свежий сверху, как и приходят из запроса.
  const past = hikes.filter((hike) => !ahead(hike));

  const row = (hike: Hike) => (
    <HikeAdminRow
      key={hike.id}
      hike={hike}
      dateLabel={formatDateTime(hike.startsAt)}
      needsOutcome={hike.status === "published" && hubPhase(hike, now) === "outcome"}
    />
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Походы</h1>
        <Link
          href="/admin/hikes/new"
          className={buttonClass({ variant: "primary" })}
        >
          Новый поход
        </Link>
      </div>

      {hikes.length === 0 ? (
        <div className={cardClass({ className: "mt-8" })}>
          <p className="text-fg-muted">
            Походов пока нет. Создай первый — он появится черновиком, и его
            никто не увидит, пока ты не опубликуешь.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-bold">Впереди</h2>
              <ul className="mt-4 flex flex-col gap-3">{upcoming.map(row)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-bold">Прошли</h2>
              <ul className="mt-4 flex flex-col gap-3">{past.map(row)}</ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
