import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { HikeForm } from "@/components/hike-form";
import { HikeLeadersEditor } from "@/components/hike-leaders-editor";
import { NoHikeAccess } from "@/components/no-hike-access";
import {
  canEditHike,
  canManageHikeLeaders,
  requireStaffPage,
} from "@/lib/auth-guards";
import { utcIsoToClubLocal } from "@/lib/hikes/datetime";
import { listAvailableLeaders, listHikeLeaders } from "@/lib/hikes/leaders";
import { getMeetingPoint } from "@/lib/hikes/meeting-point";
import { getHikeById } from "@/lib/hikes/queries";

export const metadata = { title: "Правка похода" };

export default async function EditHikePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireStaffPage(`/admin/hikes/${id}/edit`);
  const hike = await getHikeById(id);
  if (!hike) notFound();

  const [leaders, candidates, meeting] = await Promise.all([
    listHikeLeaders(hike.id, hike.leaderId),
    listAvailableLeaders(),
    getMeetingPoint(hike.id),
  ]);

  // Чужой поход правит админ, свой — создатель, а также те, кто на него идёт.
  // То же самое проверяет server action и политика RLS; здесь проверка нужна,
  // чтобы не показывать форму, сохранение из которой всё равно не пройдёт.
  //
  // Объяснение, а не redirect: раньше человек молча оказывался в списке
  // походов и не понимал, нажалась ли кнопка вообще.
  if (!canEditHike(profile, hike.leaderId, leaders.map((l) => l.id))) {
    return (
      <NoHikeAccess
        what="править этот поход"
        leaderNames={leaders.map((l) => l.fullName)}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* Назад — в группу похода, а не в общий список: сюда приходят с
          экрана группы, и туда же уводит сохранение. Строки про неизменный
          адрес похода здесь больше нет: разработчику она полезна, лидеру —
          шум (проход по экранам, 13 сентября 2026). */}
      <BackLink href={`/admin/hikes/${hike.id}`}>Группа похода</BackLink>

      <h1 className="mt-6 text-2xl font-bold">{hike.routeName ?? hike.title}</h1>

      <div className="mt-8">
        <HikeLeadersEditor
          hikeId={hike.id}
          leaders={leaders}
          candidates={candidates}
          canEdit={canManageHikeLeaders(profile, hike.leaderId)}
          currentUserId={profile.id}
        />
      </div>

      {/* Две модели сохранения на одном экране — состав пишется сразу по
          «Добавить» и «Убрать», форма ниже только по «Сохранить». Граница
          названа словами, иначе лидер, поменявший и то и другое, не знает,
          что уже записано. */}
      <h2 className="mt-12 text-xl font-bold">Поход</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Состав выше сохраняется сразу. Поля ниже — кнопкой «Сохранить» внизу.
      </p>

      <HikeForm
        hike={hike}
        startsAtLocal={utcIsoToClubLocal(hike.startsAt)}
        registrationOpensAtLocal={
          hike.registrationOpensAt
            ? utcIsoToClubLocal(hike.registrationOpensAt)
            : ""
        }
        registrationClosesAtLocal={
          hike.registrationClosesAt
            ? utcIsoToClubLocal(hike.registrationClosesAt)
            : ""
        }
        meetingPoint={meeting.point ?? ""}
        meetingPointUrl={meeting.url ?? ""}
      />
    </main>
  );
}
