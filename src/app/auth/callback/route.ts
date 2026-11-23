import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Возврат после Google OAuth и после перехода по magic link.
 * Меняет одноразовый код на сессию и кладёт её в куки.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Supabase кладёт сюда причину, если пользователь отказался в окне Google.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(`${baseUrl(request, origin)}/login?error=provider`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl(request, origin)}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${baseUrl(request, origin)}/login?error=exchange`);
  }

  return NextResponse.redirect(`${baseUrl(request, origin)}${next}`);
}

/**
 * За балансировщиком Vercel origin запроса — внутренний адрес, и редирект по
 * нему уводит пользователя не туда. Публичный адрес приезжает в x-forwarded-host.
 */
function baseUrl(request: NextRequest, origin: string): string {
  if (process.env.NODE_ENV === "development") return origin;
  const forwardedHost = request.headers.get("x-forwarded-host");
  return forwardedHost ? `https://${forwardedHost}` : origin;
}

/**
 * Куда вернуть человека после входа. Принимаются только внутренние пути:
 * без этой проверки ссылка вида /auth/callback?next=//злой-сайт уводила бы
 * прямо со страницы входа, выглядя при этом как ссылка на наш домен.
 */
function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}
