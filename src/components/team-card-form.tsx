"use client";

import Link from "@/components/link";
import { useActionState } from "react";

import { saveTeamCard, type TeamCardState } from "@/app/actions/team";
import { buttonClass, calloutClass, fieldClass } from "@/components/ui";
import { submitKeepingValues } from "@/lib/form-submit";
import type { Dictionary } from "@/lib/i18n/dictionary";

const EMPTY: TeamCardState = {};

/** Карточка лидера на странице команды: «о себе» и инстаграм. */
export function TeamCardForm({
  bio,
  instagram,
  t,
}: {
  bio: string;
  instagram: string;
  /** Кусок словаря пропсом: компонент клиентский. */
  t: Dictionary["teamCard"];
}) {
  const [state, formAction, pending] = useActionState(saveTeamCard, EMPTY);

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-4">
      <label className="block text-sm font-medium">
        {t.bio}
        <textarea
          name="bio"
          rows={3}
          maxLength={300}
          defaultValue={bio}
          placeholder={t.bioPlaceholder}
          className={`mt-2 ${fieldClass()}`}
        />
        <span className="mt-1 block font-normal text-fg-muted">{t.bioHint}</span>
      </label>

      <label className="block text-sm font-medium">
        {t.instagram}
        <input
          name="instagram"
          defaultValue={instagram}
          placeholder="nick"
          autoCapitalize="none"
          autoCorrect="off"
          className={`mt-2 ${fieldClass()}`}
        />
        <span className="mt-1 block font-normal text-fg-muted">{t.instagramHint}</span>
      </label>

      {state.message && (
        <p
          role="status"
          className={calloutClass({
            tone: state.ok ? "success" : "danger",
            compact: true,
            className: "text-sm",
          })}
        >
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass({ size: "sm" })}
        >
          {pending ? t.saving : t.save}
        </button>
        <Link href="/team" className={buttonClass({ variant: "ghost", size: "sm" })}>
          {t.seeTeam}
        </Link>
      </div>
    </form>
  );
}
