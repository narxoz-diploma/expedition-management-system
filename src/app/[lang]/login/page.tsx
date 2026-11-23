import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDictionary } from "@/lib/i18n/dictionary";
import { localizeHref } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
import { isInAppBrowser } from "@/lib/in-app-browser";
import { getCurrentUser } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).login;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (user) redirect(localizeHref("/", locale));

  const params = await searchParams;
  const t = getDictionary(locale).login;
  // Определяем на сервере: иначе баннер про встроенный браузер мигнёт уже
  // после загрузки, когда человек успеет нажать не туда.
  const userAgent = (await headers()).get("user-agent") ?? "";

  const errors: Record<string, string> = t.errors;

  return (
    <LoginForm
      inAppBrowser={isInAppBrowser(userAgent)}
      error={params.error ? (errors[params.error] ?? t.errors.exchange) : null}
      // Куда вернуть после входа — на том же языке. Ссылки на вход
      // собираются по адресу без языка (`/hikes/…` из блока записи), и без
      // этого человек с английской страницы возвращался бы на русскую.
      // /auth/callback пропускает любой внутренний путь, /en/… в том числе.
      next={localizeHref(params.next ?? "/", locale)}
      t={t}
      locale={locale}
      languageLabel={getDictionary(locale).header.language}
    />
  );
}
