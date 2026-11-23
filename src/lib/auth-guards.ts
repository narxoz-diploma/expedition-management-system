import { redirect } from "next/navigation";

import { listHikeLeaders } from "@/lib/hikes/leaders";
import { getCurrentProfile, type CurrentProfile } from "@/lib/profile";

/**
 * Проверки роли на сервере.
 *
 * Спрятать кнопку в интерфейсе — не защита: server action вызывается напрямую,
 * без всякого интерфейса. Поэтому каждая мутация начинается отсюда, даже если
 * страница, с которой её вызывают, уже закрыта такой же проверкой.
 *
 * Второй рубеж — политики RLS в базе. Здесь проверка нужна не вместо них,
 * а чтобы вернуть понятную ошибку вместо пустого результата.
 */

export class ForbiddenError extends Error {
  constructor(message = "Недостаточно прав") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Для страниц: не вошёл — отправляем на вход, не лидер — на главную.
 *
 * Вызывать обязательно в каждой странице админки, а не только в layout.
 * В App Router layout и page рендерятся параллельно, и редирект из layout
 * не мешает странице отработать и попасть в ответ. Защита данных всё равно
 * держится на политиках RLS, но отдавать посторонним хотя бы разметку
 * закрытого экрана незачем.
 *
 * `returnTo` — куда вернуть после входа. Без него человек, открывший ссылку
 * на конкретный экран, попадает после входа не туда, куда шёл.
 */
export async function requireStaffPage(
  returnTo = "/admin",
): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (profile.role !== "leader" && profile.role !== "admin") redirect("/");
  return profile;
}

/** Для server actions: бросает, а не редиректит — ответ уходит в форму. */
export async function requireStaff(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new ForbiddenError("Нужно войти");
  if (profile.role !== "leader" && profile.role !== "admin") {
    throw new ForbiddenError("Действие доступно только лидерам");
  }
  return profile;
}

/**
 * Кто правит поход: создатель, любой из идущих лидеров, админ.
 * Повторяет политику hikes_leader_update — is_hike_leader().
 *
 * Идущие лидеры включены намеренно: за день до выхода меняется время сбора,
 * автор недоступен, и если поправить карточку может только он, страдает
 * вся группа.
 */
export function canEditHike(
  profile: CurrentProfile,
  leaderId: string,
  /**
   * Обязателен намеренно, хотя раньше был необязательным.
   *
   * Со значением по умолчанию «никого» его забыли передать все шесть server
   * actions разом — правка похода, публикация, отмена, фотографии и оба
   * бланка расписки. Страницы состав передавали, поэтому второй лидер видел
   * форму, жал «Сохранить» и получал «Это чужой поход» на действие, которое
   * база ему разрешает. Пустой список теперь пишется руками и виден в диффе.
   */
  goingLeaderIds: readonly string[],
): boolean {
  return (
    profile.role === "admin" ||
    profile.id === leaderId ||
    goingLeaderIds.includes(profile.id)
  );
}

/**
 * То же самое, но состав грузится сам. Для server actions.
 *
 * Действию неоткуда взять список идущих лидеров, кроме как сходить за ним в
 * базу, и раньше каждое просто не ходило. Пусть ходит одна функция.
 *
 * Ответственный и админ отвечают «да» без запроса: это самый частый случай,
 * и гонять из-за него лишний запрос незачем.
 */
export async function canEditHikeNow(
  profile: CurrentProfile,
  hike: { id: string; leaderId: string },
): Promise<boolean> {
  if (profile.role === "admin" || profile.id === hike.leaderId) return true;

  const leaders = await listHikeLeaders(hike.id, hike.leaderId);
  return leaders.some((leader) => leader.id === profile.id);
}

/**
 * Состав лидеров и передачу ответственности — только ответственный за поход.
 * Это is_hike_responsible().
 */
export function canManageHikeLeaders(
  profile: CurrentProfile,
  leaderId: string,
): boolean {
  return profile.role === "admin" || profile.id === leaderId;
}
