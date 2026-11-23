"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { revalidateLocalized } from "@/lib/i18n/server";

/**
 * Выход. Server action, а не запрос из браузера: сессия лежит в httpOnly-куках,
 * и погасить её может только сервер.
 */
export async function signOut() {
  const supabase = await createClient();
  // Только это устройство. По умолчанию supabase-js выходит глобально — из
  // всех сессий аккаунта разом: вышел на телефоне, и компьютер молча остался
  // с мёртвой сессией (замечено автором 13 сентября 2026).
  await supabase.auth.signOut({ scope: "local" });

  // Шапка рендерится в layout и знает про пользователя, поэтому сбрасывать
  // надо весь layout, а не одну страницу — иначе имя останется висеть.
  revalidateLocalized("/", "layout");
  redirect("/");
}
