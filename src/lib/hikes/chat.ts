import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { chatRoster, type ChatRoster, type ChatStatus } from "./chat-roster.ts";

/**
 * Состав похода для сборки чата в WhatsApp.
 *
 * Отдельным запросом, а не через getRoster(): тому нужны снаряжение, отметки
 * явки и экстренные контакты, а здесь достаточно имени и номера — зато нужны
 * отменённые записи, которые getRoster отбрасывает намеренно.
 *
 * Проверки прав здесь нет: политики RLS отдают чужие записи только лидеру
 * этого похода, и забытая проверка вернёт пустоту, а не чужие телефоны.
 */
export const getChatRoster = cache(async function getChatRoster(
  hikeId: string,
  viewerId: string,
): Promise<ChatRoster> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("registrations")
    .select(
      `user_id, status, as_leader, chat_status, chat_status_at, promoted_at,
       created_at, cancelled_at,
       profiles ( full_name, phone )`,
    )
    .eq("hike_id", hikeId)
    .returns<ChatRegistrationRow[]>();

  if (error) {
    console.error("Не удалось получить состав для чата", error);
    return {
      active: [],
      done: [],
      untouched: [],
      waiting: [],
      toRemove: [],
      total: 0,
    };
  }

  return chatRoster(
    data
      .filter((row) => row.profiles !== null)
      .map((row) => ({
        userId: row.user_id,
        fullName: row.profiles!.full_name,
        phone: row.profiles!.phone,
        status: row.status,
        asLeader: row.as_leader,
        chatStatus: row.chat_status,
        chatStatusAt: row.chat_status_at,
        promotedAt: row.promoted_at,
        createdAt: row.created_at,
        cancelledAt: row.cancelled_at,
      })),
    viewerId,
  );
});

type ChatRegistrationRow = {
  user_id: string;
  status: "confirmed" | "waitlist" | "cancelled";
  as_leader: boolean;
  chat_status: ChatStatus | null;
  chat_status_at: string | null;
  promoted_at: string | null;
  created_at: string;
  cancelled_at: string | null;
  profiles: { full_name: string; phone: string | null } | null;
};
