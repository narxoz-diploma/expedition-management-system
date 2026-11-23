import { AdminNav } from "@/components/admin-nav";
import { SiteHeader } from "@/components/site-header";
import { getCurrentProfile } from "@/lib/profile";

export const metadata = {
  robots: { index: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Layout здесь не охраняет, а только рисует навигацию.
  //
  // Охраняет каждая страница сама, вызовом requireStaffPage() со своим адресом
  // возврата. Так надёжнее и предсказуемее: layout и page в App Router
  // рендерятся параллельно, и если редиректят оба, выигрывает тот, кто успел
  // первым — а значит адрес возврата после входа получался случайным.
  //
  // Настоящая защита данных всё равно ниже, в политиках RLS: страница без
  // прав не получит из базы ничего, даже если отрисуется.
  const profile = await getCurrentProfile();
  const isStaff = profile?.role === "leader" || profile?.role === "admin";

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      {/* Своя полоса у админки остаётся: лидер живёт на этих экранах, и гонять
          его на сводку ради перехода между двумя разделами — лишнее касание.
          Текущий раздел подсвечен, «Управление» — только админу: см.
          components/admin-nav.tsx. */}
      {isStaff && (
        <div className="border-b border-line bg-surface">
          <AdminNav isAdmin={profile.role === "admin"} />
        </div>
      )}

      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
