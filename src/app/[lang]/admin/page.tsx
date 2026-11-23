import type { Metadata } from "next";
import Link from "@/components/link";
import { redirect } from "next/navigation";

import { buttonClass, calloutClass, cardClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth-guards";
import { pluralWithNumber } from "@/lib/hikes/format";
import { listApplicants } from "@/lib/members";

export const metadata: Metadata = {
  title: "Управление",
  robots: { index: false },
};

/**
 * Сводка админки.
 *
 * Главная её задача сейчас — показывать очередь заявок. Статус pending прав
 * не даёт, вся его польза в том, что кто-то регулярно на него смотрит. Если
 * счётчик спрятать внутрь отдельного экрана, человек будет считать, что его
 * заявку рассматривают, а она просто висит — и это хуже, чем если бы заявок
 * не было вовсе.
 */
export default async function AdminPage() {
  const profile = await requireStaffPage("/admin");
  // Лидеру сводка не нужна: всё, что на ней есть для него, — плитка
  // «Походы», а работает он именно там (решение автора, 14 сентября 2026).
  // Плитки «Бланки» и «Срок хранения» — дела админа.
  if (profile.role !== "admin") redirect("/admin/hikes");

  const { pending } = await listApplicants();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Управление</h1>

      {/* Заявки ведут в «Приём в клуб»: всё про членство теперь там, а
          «Участники» — справочник (решение автора, 14 сентября 2026). */}
      {pending.length > 0 && (
        <div className={calloutClass({ tone: "accent", className: "mt-6" })}>
          <p className="font-medium text-fg">
            {pluralWithNumber(pending.length, "заявка", "заявки", "заявок")} на
            членство ждёт ответа
          </p>
          <Link
            href="/admin/members/admission"
            className={buttonClass({ variant: "primary", className: "mt-3" })}
          >
            Разобрать
          </Link>
        </div>
      )}

      <nav className="mt-8 flex flex-col gap-3">
        <Card
          href="/admin/hikes"
          title="Походы"
          description="Создать, опубликовать, вести группу."
        />
        <Card
          href="/admin/members"
          title="Участники"
          description="Весь клуб с поиском и отметками общего чата."
        />
        <Card
          href="/admin/members/admission"
          title="Приём в клуб"
          description={
            pending.length > 0
              ? `${pluralWithNumber(pending.length, "заявка", "заявки", "заявок")} ждут ответа. Номера из группы, коды, гости.`
              : "Заявки, номера из группы, коды семестра, гости."
          }
        />
        <Card
          href="/admin/waivers"
          title="Бланки расписки"
          description="Два файла на весь клуб — для взрослых и для младше 18."
        />
        <Card
          href="/admin/data"
          title="Срок хранения"
          description="Кого пора стереть: год без походов."
        />
      </nav>
    </main>
  );
}

/**
 * Плитка раздела — строкой со стрелкой. До 14 сентября 2026 плитки выглядели
 * информационными карточками: ни стрелки, ни отклика, и нажимаемость
 * угадывалась.
 */
function Card({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className={cardClass({
        className: "flex items-center gap-4 transition-colors hover:bg-surface-raised",
      })}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-fg">{title}</span>
        <span className="mt-1 block text-sm text-fg-muted">{description}</span>
      </span>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5 shrink-0 text-fg-muted"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
