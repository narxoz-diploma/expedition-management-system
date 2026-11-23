import type { Metadata } from "next";
import Link from "@/components/link";

import { Directory } from "@/components/directory";
import { buttonClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth-guards";
import { DIRECTORY_LIMIT, listDirectory } from "@/lib/directory";
import { pluralWithNumber } from "@/lib/hikes/format";
import { listApplicants } from "@/lib/members";

export const metadata: Metadata = {
  title: "Участники",
  robots: { index: false },
};

/**
 * Справочник клуба.
 *
 * До него увидеть клуб целиком не мог никто, кроме админа: лидеру политика
 * отдавала гостей, заявки и людей со своих походов. Границу двигает не эта
 * страница, а вьюха `club_directory` — там явный список колонок, и чего в
 * нём нет (дата рождения, экстренные контакты), того через эту дверь не
 * достать.
 *
 * Отметка «в общем чате» живёт здесь же, а не отдельным экраном: список
 * людей для неё нужен ровно этот, и два одинаковых экрана были бы просто
 * двумя одинаковыми экранами.
 *
 * Заявок здесь больше нет: до 14 сентября 2026 они стояли и тут, и в
 * «Приёме в клуб». Всё про членство — в одном месте, здесь только ссылка
 * туда со счётчиком (решение автора).
 */
export default async function AdminMembersPage() {
  // Гард именно здесь, а не только в layout: страницы рендерятся параллельно
  // с ним, и его редирект странице не помеха.
  await requireStaffPage("/admin/members");

  const [{ pending }, directory] = await Promise.all([
    listApplicants(),
    listDirectory(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-2xl font-bold">Участники</h1>
        <Link
          href="/admin/members/admission"
          className={buttonClass({ size: "sm" })}
        >
          Приём в клуб
          {pending.length > 0 &&
            ` · ${pluralWithNumber(pending.length, "заявка", "заявки", "заявок")}`}
        </Link>
      </div>

      <Directory
        people={directory.people}
        truncatedAt={directory.truncated ? DIRECTORY_LIMIT : null}
      />
    </main>
  );
}
