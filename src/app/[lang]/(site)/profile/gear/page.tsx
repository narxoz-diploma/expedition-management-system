import type { Metadata } from "next";
import Link from "@/components/link";
import { redirect } from "next/navigation";

import { CategoryScale } from "@/components/category-scale";
import { GearForm } from "@/components/gear-form";
import { cardClass } from "@/components/ui";
import {
  gearReadyUpTo,
  listMyGear,
  missingForCategory,
  promisedForCategory,
} from "@/lib/gear";
import type { HikeCategory } from "@/lib/hikes/types";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { gearGroupTitles } from "@/lib/i18n/gear-groups";
import { localizeHref } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
import { getCurrentProfile } from "@/lib/profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).gear;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function GearPage() {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  if (!profile) redirect(localizeHref("/login?next=/profile/gear", locale));

  const dict = getDictionary(locale);
  const t = dict.gear;
  const names: Record<string, string> = dict.gearItems;

  // Название вещи — по slug из словаря языка; вещь без перевода остаётся с
  // названием из базы. Переводим до всех расчётов, чтобы и сводка наверху, и
  // форма говорили одними словами.
  const items = (await listMyGear()).map((item) => ({
    ...item,
    name: names[item.slug] ?? item.name,
  }));
  const ready = gearReadyUpTo(items);
  // Что мешает подняться на одну ступень — конкретный список, а не процент.
  const nextCategory = Math.min(ready + 1, 5);
  const missingForNext = missingForCategory(items, nextCategory);
  // Обещанное отдельно от недостающего: это разные разговоры — «купи или не
  // иди» против «не забудь забрать».
  const promisedForNext = promisedForCategory(items, nextCategory);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-3 text-fg-muted">{t.lead}</p>

      {items.length > 0 && (
        <section className={cardClass({ className: "mt-6" })}>
          {ready === 0 ? (
            <p className="font-medium text-fg">{t.notReadyBasic}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-fg">{fill(t.readyUpTo, { n: ready })}</p>
              <CategoryScale category={ready as HikeCategory} />
            </div>
          )}

          {ready < 5 && missingForNext.length > 0 && (
            <p className="mt-3 text-fg-muted">
              {fill(t.missingFor, { n: nextCategory })}{" "}
              <span className="text-fg">
                {missingForNext.map((item) => item.name.toLowerCase()).join(", ")}
              </span>
              .
            </p>
          )}

          {ready < 5 && promisedForNext.length > 0 && (
            <p className="mt-3 text-fg-muted">
              {t.promised}{" "}
              <span className="text-fg">
                {promisedForNext.map((item) => item.name.toLowerCase()).join(", ")}
              </span>
              {t.promisedAfter}
            </p>
          )}

          {ready === 5 && <p className="mt-3 text-fg-muted">{t.allReady}</p>}
        </section>
      )}

      {items.length === 0 ? (
        <p className="mt-8 text-fg-muted">{t.empty}</p>
      ) : (
        <GearForm items={items} t={dict.gearForm} groupTitles={gearGroupTitles(dict.gearGroups)} />
      )}

      <div className={cardClass({ className: "mt-10" })}>
        <p className="text-fg-muted">{t.guideNote}</p>
        <Link
          href="/gear-guide"
          className="mt-3 inline-flex h-tap items-center text-accent-500 underline underline-offset-4"
        >
          {t.guideLink}
        </Link>
      </div>
    </main>
  );
}
