import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Клиент Supabase для server components, server actions и route handlers.
 *
 * Создавать заново на каждый запрос и никогда не выносить в модульную
 * переменную: клиент несёт в себе сессию конкретного пользователя, а один
 * серверный процесс обслуживает многих.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Из server component куки записать нельзя — Next это запрещает.
          // Не ошибка: обновлением сессии занимается proxy.ts, и там запись
          // проходит. Пустой catch здесь намеренный.
        }
      },
    },
  });
}

/**
 * Текущий пользователь или null.
 *
 * Всегда getUser(), а не getSession(): getSession() возвращает содержимое
 * куки как есть, без проверки подписи, и доверять ему на сервере нельзя.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
