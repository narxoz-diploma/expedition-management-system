"use client";

import Link from "@/components/link";
import { useState, useSyncExternalStore } from "react";

import { LanguageSelect } from "@/components/language-select";
import { LogoMark } from "@/components/logo";
import { buttonClass, calloutClass, fieldClass } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "working" | "sent";

const noop = () => () => {};

/**
 * Фирменный знак Google для кнопки входа.
 *
 * Инлайном, а не картинкой: знак должен появиться вместе с кнопкой, иначе
 * на медленном соединении сначала видно кнопку без логотипа — ровно то, из-за
 * чего она и перестаёт узнаваться.
 */
function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * Завершилась ли гидратация.
 *
 * До неё обработчики не навешаны, и нажатие на кнопку просто пропадает.
 * На быстром соединении это доли секунды, но новичок с плохим мобильным
 * интернетом успевает ткнуть в мёртвую кнопку и решить, что сайт сломан.
 * Поймано при проверке на живом деплое: первый клик действительно пропал.
 *
 * Через useSyncExternalStore, а не через useEffect: разные снимки для сервера
 * и клиента — штатный для React способ отличить одно от другого, и он не
 * вызывает лишний каскад ререндеров.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function LoginForm({
  inAppBrowser,
  error,
  next,
  t,
  locale,
  languageLabel,
}: {
  inAppBrowser: boolean;
  error: string | null;
  next: string;
  /** Кусок словаря пропсом: компонент клиентский, словарь целиком — на сервере. */
  t: Dictionary["login"];
  locale: Locale;
  languageLabel: string;
}) {
  const shell = { locale, languageLabel };
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  // Отдельно от status: тот описывает письмо, и общий флаг писал
  // «Отправляем…» на кнопке почты, когда нажали Google (13 сентября 2026).
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error);
  const [copied, setCopied] = useState(false);

  /*
   * Почта — запасной путь, и на экране она свёрнута: два равноправных способа
   * входа заставляют выбирать там, где выбирать не из чего. Google быстрее
   * (без письма, без папки «Спам», без почасового лимита Supabase, который
   * пока нечем снять — своего домена у клуба нет, Resend не подключить).
   *
   * Но именно свёрнута, а не убрана: во встроенном окне мессенджера Google
   * не работает вовсе, и там форма раскрыта сразу. Определение WebView —
   * эвристика и может промахнуться, поэтому до почты всегда один тап.
   */
  const [emailOpen, setEmailOpen] = useState(inAppBrowser);

  const ready = useHydrated();
  const busy = !ready || status === "working" || googleBusy;

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setGoogleBusy(false);
      setMessage(t.googleFailed);
      // Сообщение отправляет к почте — она должна быть уже на экране, иначе
      // человек ищет то, чего не видит.
      setEmailOpen(true);
    }
    // При успехе браузер уходит на Google, возвращать состояние незачем.
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus("working");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });

    if (error) {
      setStatus("idle");
      setMessage(error.message.toLowerCase().includes("rate") ? t.rateLimited : t.sendFailed);
      return;
    }
    setStatus("sent");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (status === "sent") {
    return (
      <Shell {...shell}>
        <h1 className="text-3xl font-bold">{t.sentTitle}</h1>
        {/* Само письмо — из шаблона Supabase и одно на весь проект: его язык
            страница входа не меняет (ROADMAP, «Три языка»). */}
        <p className="mt-4 text-fg-muted">
          {t.sentBefore} <span className="text-fg">{email}</span>. {t.sentAfter}
        </p>
        {/* Пока у клуба нет своего домена, письма уходят с адреса Supabase и
            попадают в спам чаще обычного. Без этой строчки человек решает,
            что письмо не дошло, и жмёт «отправить» ещё раз — приближая
            почасовой лимит, из-за которого следующим не придёт уже ничего. */}
        <p className="mt-3 text-sm text-fg-muted">{t.spam}</p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setMessage(null);
          }}
          className={buttonClass({ variant: "ghost", className: "mt-8 self-start" })}
        >
          {t.otherEmail}
        </button>
      </Shell>
    );
  }

  return (
    <Shell {...shell}>
      <h1 className="text-3xl font-bold">{t.title}</h1>
      <p className="mt-3 text-fg-muted">{t.lead}</p>

      {inAppBrowser && (
        <div className={calloutClass({ tone: "warning", className: "mt-6" })}>
          <p className="font-medium text-fg">{t.inAppTitle}</p>
          <p className="mt-2 text-sm text-fg-muted">{t.inAppBody}</p>
          <button
            type="button"
            onClick={copyLink}
            className={buttonClass({ block: true, className: "mt-4" })}
          >
            {copied ? t.copied : t.copy}
          </button>
        </div>
      )}

      {message && (
        <p
          role="alert"
          className={calloutClass({ tone: "danger", className: "mt-6 text-sm text-fg" })}
        >
          {message}
        </p>
      )}

      {/* Оформление по фирменным правилам Google: свои цвета здесь применять
          нельзя, а узнаваемость кнопки сама по себе работает лучше любого
          выделения акцентом. У Google отдельные пары для тёмной и светлой
          темы — они в токенах google-* в globals.css. */}
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        aria-busy={busy}
        /* Скругление как у остальных кнопок сайта: правила Google разрешают
           и прямоугольную, и «таблетку», а прямоугольная выглядела чужой. */
        className="mt-6 flex h-tap w-full items-center justify-center gap-3 rounded-full border border-google-border bg-google-bg px-4 font-medium text-google-fg disabled:opacity-60"
      >
        <GoogleMark />
        {t.google}
      </button>

      {/* Не мелким: это снимает главный страх на входе — «меня уводят не туда».
          Предупреждение, которое не прочитали, не работает. */}
      {/* Без «базы данных»: перед входом эти слова скорее тревожили, чем
          успокаивали. Строка уйдёт совсем со своим доменом клуба. */}
      <p className="mt-3 text-fg-muted">
        {t.supabaseBefore}
        <span className="text-fg"> ...supabase.co</span> {t.supabaseAfter}
      </p>

      {/* Разделителя «или» здесь больше нет: он подавал два способа как
          равные, хотя почта — запасной. */}
      {!emailOpen && (
        <button
          type="button"
          onClick={() => setEmailOpen(true)}
          className={buttonClass({ variant: "ghost", size: "sm", className: "mt-4 -ml-4 self-start" })}
        >
          {t.emailToggle}
        </button>
      )}

      {emailOpen && (
      <form onSubmit={sendMagicLink} className="mt-6">
        <label htmlFor="email" className="block text-sm font-medium">
          {t.emailLabel}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={`mt-2 ${fieldClass()}`}
        />
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className={buttonClass({ block: true, className: "mt-3" })}
        >
          {status === "working" ? t.sending : t.send}
        </button>
      </form>
      )}
    </Shell>
  );
}

/**
 * Каркас входа: знак клуба сверху и содержимое под ним.
 *
 * Шапки сайта у входа нет, и до 14 сентября 2026 заголовок висел посередине
 * пустого экрана — без логотипа и без пути назад. Знак ведёт на главную:
 * передумавший уходит в одно касание.
 */
function Shell({
  children,
  locale,
  languageLabel,
}: {
  children: React.ReactNode;
  locale: Locale;
  languageLabel: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-6">
      {/* Язык — в строке со знаком: шапки у входа нет, а сюда часто приходят
          прямо по ссылке из чата, и выбрать язык нужно до формы. */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex h-tap items-center gap-2 font-display text-lg font-bold tracking-tight text-fg"
        >
          <LogoMark className="h-6 w-auto shrink-0" />
          Step&nbsp;Up
        </Link>
        <LanguageSelect locale={locale} label={languageLabel} />
      </div>
      <div className="mt-16 flex flex-col">{children}</div>
    </main>
  );
}
