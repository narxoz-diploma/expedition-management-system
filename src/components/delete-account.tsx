"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteMyAccount } from "@/app/actions/account";
import { buttonClass, calloutClass } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, isLocale, localizeHref } from "@/lib/i18n/locales";

/**
 * Удаление своих данных.
 *
 * Два шага, потому что откатить нечего: строки уносит каскад, и «отменить»
 * после нажатия не существует. Первый шаг ничего не делает — он только
 * показывает, что именно исчезнет, и это и есть содержание предупреждения.
 */
export function DeleteAccount({
  leadsFutureHike,
  t,
}: {
  leadsFutureHike: boolean;
  /** Кусок словаря пропсом: компонент клиентский. */
  t: Dictionary["deleteAccount"];
}) {
  const router = useRouter();
  const params = useParams();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await deleteMyAccount();
      if (!r.ok) {
        setError(r.message ?? t.failed);
        return;
      }
      // Учётной записи уже нет — уводим на главную, а не оставляем на
      // странице, которой больше нечего показать. На главную того же языка:
      // router.replace мимо обёртки Link, и язык здесь надо дописать самим.
      const locale = isLocale(params?.lang) ? params.lang : DEFAULT_LOCALE;
      router.replace(localizeHref("/", locale));
      router.refresh();
    });
  }

  if (leadsFutureHike) {
    return <p className="text-sm text-fg-muted">{t.leadsFuture}</p>;
  }

  if (!confirming) {
    return (
      /* danger, а не ghost: по UI.md красным помечено необратимое, и
         ничего более необратимого на сайте нет. Приглушённой ссылкой это
         выглядело как «выйти» — то есть как действие, которое можно
         передумать. */
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClass({ variant: "danger", size: "sm" })}
      >
        {t.start}
      </button>
    );
  }

  return (
    <div className={calloutClass({ tone: "danger", compact: true })}>
      <p className="font-medium text-fg">{t.confirmTitle}</p>
      <p className="mt-2 text-sm text-fg-muted">{t.confirmBody}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className={buttonClass({ variant: "danger", size: "sm" })}
        >
          {pending ? t.deleting : t.confirm}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          {t.keep}
        </button>
      </div>
    </div>
  );
}
