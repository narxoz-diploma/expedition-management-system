"use client";

import { useState, useTransition } from "react";

import {
  redeemInviteCode,
  requestMembership,
  type ActionResult,
} from "@/app/actions/membership";
import { buttonClass, calloutClass, fieldClass } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { MembershipStatus } from "@/lib/profile";

export function JoinForm({
  status,
  t,
}: {
  status: MembershipStatus;
  /** Кусок словаря пропсом: компонент клиентский. */
  t: Dictionary["joinForm"];
}) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const alreadyApplied = status === "pending";

  function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => setResult(await redeemInviteCode(code)));
  }

  function apply() {
    setResult(null);
    startTransition(async () => setResult(await requestMembership()));
  }

  return (
    /* Форма уже страницы — см. docs/UI.md §1. */
    <div className="mt-8 max-w-xl">
      {result && (
        <p
          role="alert"
          className={calloutClass({
            tone: result.ok ? "success" : "danger",
            compact: true,
            className: "mb-6 text-sm",
          })}
        >
          {result.message}
        </p>
      )}

      <form onSubmit={submitCode}>
        <label htmlFor="code" className="block font-medium">
          {t.codeLabel}
        </label>
        <p className="mt-1 text-sm text-fg-muted">{t.codeHint}</p>
        {/* Сам код — латиницей на любом языке: его печатает лидер в группе. */}
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="OSEN2026"
          className={`mt-3 ${fieldClass()}`}
        />
        <button
          type="submit"
          disabled={pending || code.trim().length === 0}
          className={buttonClass({ variant: "primary", block: true, className: "mt-3" })}
        >
          {pending ? t.checking : t.submit}
        </button>
      </form>

      <div className="my-8 flex items-center gap-3 text-sm text-fg-muted">
        <span className="h-px flex-1 bg-line" />
        {t.noCode}
        <span className="h-px flex-1 bg-line" />
      </div>

      {alreadyApplied ? (
        <div className={calloutClass({ tone: "accent", compact: true })}>
          <p className="font-medium text-fg">{t.appliedTitle}</p>
          <p className="mt-2 text-sm text-fg-muted">{t.appliedBody}</p>
        </div>
      ) : (
        <>
          {/* Тише кода: заявка — работа лидерам, и новичку она не нужна —
              первый поход с пометкой «Можно новичкам» даёт членство сам. */}
          <p className="text-fg-muted">{t.applyNote}</p>
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className={buttonClass({ variant: "ghost", size: "sm", className: "mt-3 -ml-4" })}
          >
            {pending ? t.sending : t.apply}
          </button>
        </>
      )}
    </div>
  );
}
