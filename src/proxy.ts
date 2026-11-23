import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  decideMaintenance,
  MAINTENANCE_BYPASS_COOKIE,
  MAINTENANCE_HTML,
} from "@/lib/maintenance";
import { LOCALE_HEADER, resolveLocaleRoute } from "@/lib/i18n/locales";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Обновление сессии Supabase перед каждым рендером.
 *
 * В Next 16 это файл `proxy.ts`, а не `middleware.ts`: конвенцию переименовали,
 * старое имя объявлено устаревшим. Функция обязана называться `proxy`.
 *
 * Без этого файла токен доступа протухает и пользователя молча выкидывает.
 */
export async function proxy(request: NextRequest) {
  // Рубильник — до похода в Supabase, а не после: он обязан работать, даже
  // если причина работ — сама база не отвечает. Второй случай — тестирование
  // опубликованного похода и запись видео-инструкции без того, чтобы это
  // увидели текущие пользователи (см. lib/maintenance.ts).
  const decision = decideMaintenance(
    process.env.MAINTENANCE_MODE,
    process.env.MAINTENANCE_BYPASS_TOKEN,
    request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value,
    request.nextUrl.searchParams.get("bypass"),
  );

  if (decision.action === "block") {
    return new NextResponse(MAINTENANCE_HTML, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (decision.action === "grant-bypass") {
    // Редирект, а не пропуск сразу: токен не должен оставаться в адресной
    // строке, особенно на записи экрана, ради которой рубильник и заводится.
    const url = request.nextUrl.clone();
    url.searchParams.delete("bypass");
    const redirect = NextResponse.redirect(url);
    redirect.cookies.set(MAINTENANCE_BYPASS_COOKIE, decision.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return redirect;
  }

  // Язык в адресе. После рубильника: заглушке техработ язык не нужен, а
  // обходной токен должен срабатывать на любом адресе.
  const route = resolveLocaleRoute(request.nextUrl.pathname);

  if (route.action === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.redirect(url);
  }

  const rewriteUrl =
    route.action === "rewrite"
      ? Object.assign(request.nextUrl.clone(), { pathname: route.pathname })
      : null;

  // Заголовки собираются заново на каждый ответ, а не один раз: Supabase ниже
  // дописывает в запрос свежие куки, и скопированные заранее заголовки их бы
  // не увидели — сессия обновлялась бы в ответе, но не в самом рендере.
  const respond = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, route.locale);
    const init = { request: { headers: requestHeaders } };
    return rewriteUrl ? NextResponse.rewrite(rewriteUrl, init) : NextResponse.next(init);
  };

  let response = respond();

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = respond();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Между созданием клиента и этим вызовом не должно быть никакой логики:
  // именно getUser() обновляет токен и складывает свежие куки в ответ.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Всё, кроме статики и картинок. Без этого исключения обновление сессии
    // запускалось бы на каждый css и шрифт.
    //
    // opengraph-image вынесен отдельно, потому что расширения у него нет и под
    // правило с точкой он не подпадает. За картинкой превью приходит краулер
    // мессенджера — без сессии, без кук и ненадолго. Обновление сессии для него
    // не просто бесполезно: это лишний поход в Supabase перед каждой отдачей
    // картинки, а если проект на бесплатном тарифе успел заснуть, первый такой
    // запрос будит базу и легко выходит за таймаут краулера — превью тогда
    // молча не появляется.
    "/((?!_next/static|_next/image|favicon.ico|.*opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
