"use client";

import Link from "@/components/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

import { LogoMark } from "@/components/logo";
import { buttonClass, calloutClass } from "@/components/ui";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/locales";

// Одна попытка автоматической перезагрузки за вкладку — второй раз подряд
// молча не перезагружаем, чтобы не зациклиться, если причина не в устаревшей
// сборке, а в настоящей поломке.
const RELOADED_FLAG = "su_reloaded_after_stale_chunk";

/*
 * Тексты — прямо здесь, а не из словаря. Граница ошибок клиентская, а словарь
 * живёт на сервере: пропсом ей его не передать (error.tsx пропсов не
 * получает), а импорт dictionary.ts утащил бы тексты всего сайта в бандл
 * каждой страницы. Экран редкий, строк десяток — три копии дешевле.
 * Казахский не вычитан, см. dictionaries/kk.ts.
 */
const TEXT: Record<
  Locale,
  {
    reloading: string;
    title: string;
    body: string;
    retry: string;
    signIn: string;
    home: string;
    codeBefore: string;
    codeAfter: string;
    details: string;
    noText: string;
  }
> = {
  ru: {
    reloading: "Секунду, обновляем страницу…",
    title: "Что-то сломалось",
    body: "Страница не открылась. Чаще всего помогает повторить, а после выхода из аккаунта на другом устройстве — войти заново. Не помогло — напиши лидеру в чат клуба.",
    retry: "Попробовать снова",
    signIn: "Войти заново",
    home: "На главную",
    codeBefore: "Код ошибки:",
    codeAfter: "— назови его, если будешь писать.",
    details: "Технические подробности — сфотографируй экран и пришли лидеру:",
    noText: "(без текста)",
  },
  en: {
    reloading: "One moment, reloading the page…",
    title: "Something broke",
    body: "The page didn't open. Retrying usually helps, and after signing out on another device — signing in again. If that doesn't help, message a leader in the club chat.",
    retry: "Try again",
    signIn: "Sign in again",
    home: "Home",
    codeBefore: "Error code:",
    codeAfter: "— mention it if you write to us.",
    details: "Technical details — take a photo of the screen and send it to a leader:",
    noText: "(no message)",
  },
  kk: {
    reloading: "Бір сәт, бетті жаңартып жатырмыз…",
    title: "Бірдеңе бұзылды",
    body: "Бет ашылмады. Көбіне қайталау көмектеседі, ал басқа құрылғыда аккаунттан шыққаннан кейін — қайта кіру. Көмектеспесе — клуб чатында жетекшіге жаз.",
    retry: "Қайталап көру",
    signIn: "Қайта кіру",
    home: "Басты бетке",
    codeBefore: "Қате коды:",
    codeAfter: "— жазсаң, осы кодты айт.",
    details: "Техникалық мәліметтер — экранды суретке түсіріп, жетекшіге жібер:",
    noText: "(мәтінсіз)",
  },
};

/**
 * Кусок JS остался от предыдущего деплоя, а на Vercel его уже не раздают.
 *
 * Наступает так: вкладка была открыта, пока сайт выкатывал новый деплой, и
 * при следующем переходе браузер просит файл под именем из уже нерабочей
 * сборки. У нас это будет случаться регулярно — деплоев в день бывает
 * несколько. Ошибка целиком клиентская, `error.digest` у неё нет и быть не
 * может (см. digest ниже): она не долетает до сервера, и потому не видна ни
 * в логах Vercel, ни в Supabase — со стороны выглядит необъяснимой.
 *
 * Разные окружения называют её по-разному, отсюда список: у Safari
 * сообщение своё, «Importing a module script failed», не похожее на
 * остальные — этим и поймано 7 сентября 2026 на живом отчёте без единого
 * следа в логах.
 *
 * `reset()` здесь не помогает: он перерисовывает упавшее поддерево тем же
 * бандлом, а не перезапрашивает страницу — модуль, которого не существует,
 * не появится оттого, что React попробовал ещё раз. Нужна настоящая
 * перезагрузка, поэтому автоматический путь — единственный, который чинит.
 */
function isStaleChunkError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /Loading (chunk|CSS chunk) \d+ failed/.test(error.message) ||
    /Failed to fetch dynamically imported module/.test(error.message) ||
    /Importing a module script failed/.test(error.message)
  );
}

/**
 * Неожиданная ошибка на любой странице сайта.
 *
 * Клиентский компонент — так требует Next: границе ошибок нужен `reset()`,
 * который перерисовывает упавшее поддерево без перезагрузки страницы. Из-за
 * этого шапку сюда не поставить (она серверная и ходит за профилем), поэтому
 * наверху только знак-ссылка на главную: выход отсюда должен быть всегда.
 *
 * «Попробовать снова» стоит первой не для вида. Половина оставшихся ошибок
 * здесь — сорвавшийся запрос к Supabase или проснувшаяся из сна база, и
 * повтор действительно чинит. Человека, у которого всё исправляется одним
 * нажатием, незачем отправлять на главную и заставлять искать своё место
 * заново. Устаревшую сборку (см. isStaleChunkError выше) эта кнопка не
 * чинит — для неё отдельная, автоматическая ветка ниже.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const t = TEXT[isLocale(params?.lang) ? params.lang : DEFAULT_LOCALE];

  const staleChunk = isStaleChunkError(error);
  // sessionStorage недоступен на сервере, а на сервере эта граница тоже
  // рендерится — для ошибок, упавших при серверном рендере (у них как раз
  // есть digest, см. ниже). typeof — безопасная проверка без обращения к
  // необъявленному в Node глобалу.
  const alreadyTried =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(RELOADED_FLAG) === "1";

  useEffect(() => {
    // В консоль сервера это уже попало; здесь — чтобы при разборе с телефона
    // было что показать. digest — единственная ниточка к серверному логу
    // Vercel: текст ошибки в продакшене на клиент не приезжает намеренно.
    console.error("Страница упала", error);

    if (staleChunk && !alreadyTried) {
      sessionStorage.setItem(RELOADED_FLAG, "1");
      window.location.reload();
    }
  }, [error, staleChunk, alreadyTried]);

  // Пока идёт автоматическая перезагрузка, «Что-то сломалось» на экране
  // только пугает — человек не успевает даже прочитать, страница уже
  // уходит. Показываем нейтральную строку вместо мигающей ошибки.
  if (staleChunk && !alreadyTried) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-fg-muted">{t.reloading}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-6">
          <Link
            href="/"
            className="flex h-tap items-center gap-2 font-display text-lg font-bold tracking-tight text-fg"
          >
            <LogoMark className="h-5" />
            Step Up
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold">{t.title}</h1>

        <div className={calloutClass({ tone: "danger", className: "mt-6" })}>
          {/* Без «на нашей стороне, не у тебя»: автор вызвал этот экран
              выходом из аккаунта на другом устройстве (13 сентября 2026), и
              уверенное «не у тебя» было неправдой. Причину экран не знает —
              он предлагает то, что чаще всего чинит. */}
          <p className="text-fg-muted">{t.body}</p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className={buttonClass({ variant: "primary" })}
            >
              {t.retry}
            </button>
            <Link href="/login" className={buttonClass()}>
              {t.signIn}
            </Link>
            <Link href="/" className={buttonClass({ variant: "ghost" })}>
              {t.home}
            </Link>
          </div>
        </div>

        {/* Код нужен не человеку, а тому, кто будет разбираться: по нему
            серверный лог находится за секунды. Без него остаётся «у меня
            что-то не работало вчера вечером». */}
        {error.digest ? (
          <p className="mt-6 text-sm text-fg-muted">
            {t.codeBefore} <span className="font-mono">{error.digest}</span> {t.codeAfter}
          </p>
        ) : (
          // Digest нет — значит ошибка чисто клиентская (см. isStaleChunkError
          // выше) и ни в один серверный лог не попала: со стороны разработчика
          // она невидима вообще. error.message при этом не редактируется Next
          // и ничего серверного не содержит — это ровно то, что бросил
          // браузер, — поэтому его безопасно показать и попросить прислать.
          <div className="mt-6">
            <p className="text-sm text-fg-muted">{t.details}</p>
            <p className="mt-2 rounded-md border border-line p-3 font-mono text-xs break-words text-fg-muted">
              {error.name}: {error.message || t.noText}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
