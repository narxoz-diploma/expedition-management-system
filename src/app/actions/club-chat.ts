"use server";

import { requireStaff } from "@/lib/auth-guards";
import { dbErrorMessage } from "@/lib/db-errors";
import type { ChatStatus } from "@/lib/hikes/chat-roster";
import { createClient } from "@/lib/supabase/server";

export type ClubChatResult = { ok: boolean; message?: string };

/**
 * Отметка «в общем чате клуба». Одна на человека навсегда, а не на поход.
 *
 * `null` снимает отметку — как и у чата похода: промах по строке в списке на
 * сотню человек должен чиниться, а не оставаться навсегда.
 *
 * Права проверяет и set_club_chat_status() по is_staff(); здесь проверка
 * ради понятного ответа формы, а не вместо неё.
 */
export async function setClubChatStatus(
  userId: string,
  status: ChatStatus | null,
): Promise<ClubChatResult> {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_club_chat_status", {
    p_user: userId,
    p_status: status,
  });

  if (error) return { ok: false, message: dbErrorMessage(error) };

  // revalidatePath намеренно не зовём — как и на сборке чата похода. В
  // режиме «не в общем чате» обновление списка убрало бы отмеченную строку
  // прямо из-под пальца, который её нажал. Разбивка считается при загрузке;
  // счётчик наверху до обновления страницы остаётся прежним, и это меньшее
  // зло, чем прыгающий список на сотню человек.
  return { ok: true };
}
