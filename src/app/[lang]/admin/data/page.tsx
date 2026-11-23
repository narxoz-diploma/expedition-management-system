import { redirect } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { DeleteProfileButton } from "@/components/delete-profile-button";
import { calloutClass, cardClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth-guards";
import { formatDate } from "@/lib/hikes/format";
import { listStaleProfiles } from "@/lib/stale-profiles";

export const metadata = { title: "Срок хранения данных" };

/**
 * Кого пора стереть по сроку хранения.
 *
 * Без планировщика намеренно: автоматика потребовала бы pg_cron или задачи на
 * Vercel — нового движущегося куска, который некому чинить при передаче
 * проекта. Здесь как везде на сайте: считает сайт, нажимает человек.
 *
 * Только админ. Лидеру доступ к контактам своей группы дан для похода, а не
 * для распоряжения чужими данными.
 */
export default async function DataRetentionPage() {
  const profile = await requireStaffPage("/admin/data");
  if (profile.role !== "admin") redirect("/admin");

  const stale = await listStaleProfiles();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink href="/admin">Управление</BackLink>

      <h1 className="mt-4 text-2xl font-bold">Срок хранения</h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Год без походов — данные пора стереть. Так написано в согласии, которое
        человек поставил галочкой, и держать их дольше мы не договаривались.
      </p>

      {/* Про чужие данные — отдельно и заметно: это единственное, что в базе
          принадлежит человеку, который сюда не заходил и согласия не давал. */}
      <p className={calloutClass({ tone: "warning", className: "mt-6 text-sm" })}>
        Вместе с профилем стирается и контакт на случай ЧП — имя и телефон
        родителя или близкого. Эти данные чужие: их владелец на сайт не
        заходил и согласия не давал, и лишний год они лежать не должны.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-bold">
          {stale.length === 0 ? "Чистить нечего" : `Пора стереть — ${stale.length}`}
        </h2>

        {stale.length === 0 ? (
          <p className="mt-4 text-fg-muted">
            Все, кто есть в базе, ходили с клубом за последний год.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {stale.map((person) => (
              <li key={person.id} className={cardClass({ dense: true })}>
                <p className="font-medium text-fg">{person.fullName}</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {person.lastHikeAt
                    ? `Последний поход ${formatDate(person.lastHikeAt)}`
                    : `Ни одного похода, профиль с ${formatDate(person.createdAt)}`}
                  {person.hasEmergencyContact && " · есть контакт на случай ЧП"}
                </p>
                <div className="mt-3">
                  <DeleteProfileButton userId={person.id} name={person.fullName} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
