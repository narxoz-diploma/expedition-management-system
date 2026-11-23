import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Клиент Supabase для клиентских компонентов.
 *
 * Нужен ровно там, где без браузера не обойтись: вход через OAuth и magic link.
 * Данные грузятся на сервере — см. lib/supabase/server.ts.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
