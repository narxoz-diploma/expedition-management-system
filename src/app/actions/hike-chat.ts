"use server";

import { requireStaff } from "@/lib/auth-guards";
import { dbErrorMessage } from "@/lib/db-errors";
import type { ChatStatus } from "@/lib/hikes/chat-roster";
import { createClient } from "@/lib/supabase/server";

export type ChatActionResult = { ok: boolean; message?: string };

/**
 * Отметка о сборке чата: добавлен по номеру или отправлена ссылка.
 *
 * `null` снимает отметку. Возможность снять — не украшение: ровно её не
 * хватало отметкам явки, и лидер, промахнувшийся по строке в списке из
 * двадцати человек, не мог вернуть «не трогал».
 *
 * Права проверяет и set_chat_status() по is_hike_leader() — здесь проверка
 * стоит ради понятного ответа формы, а не вместо неё.
 */
export async function setChatStatus(
  hikeId: string,
  userId: string,
  status: ChatStatus | null,
): Promise<ChatActionResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chat_status", {
    p_hike_id: hikeId,
    p_user_id: userId,
    p_status: status,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  // revalidatePath здесь намеренно НЕ вызывается.
  //
  // Экран сворачивает сделанные строки, и обновление с сервера переложило бы
  // строку в свёрнутый блок ровно в момент нажатия — то есть она исчезла бы
  // из-под пальца. Разбивка на «в работе» и «в чате» считается при загрузке
  // страницы: в моменте порядок стоит на месте, между заходами прибран.
  // Клиент показывает новое состояние сам, а расхождения нет — следующий
  // заход читает базу заново.
  return { ok: true };
}
