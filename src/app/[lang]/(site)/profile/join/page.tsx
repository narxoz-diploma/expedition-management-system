import type { Metadata } from "next";
import Link from "@/components/link";
import { redirect } from "next/navigation";

import { JoinForm } from "@/components/join-form";
import { buttonClass } from "@/components/ui";
import { getDictionary } from "@/lib/i18n/dictionary";
import { localizeHref } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
import { getCurrentProfile } from "@/lib/profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).join;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function JoinPage() {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  if (!profile) redirect(localizeHref("/login?next=/profile/join", locale));

  const dict = getDictionary(locale);
  const t = dict.join;

  if (profile.membershipStatus === "member") {
    return (
      <Shell title={t.memberTitle}>
        <p className="mt-3 text-fg-muted">{t.memberBody}</p>
        <Link href="/hikes" className={buttonClass({ className: "mt-6" })}>
          {t.browseHikes}
        </Link>
      </Shell>
    );
  }

  if (profile.membershipStatus === "alumni") {
    return (
      <Shell title={t.alumniTitle}>
        <p className="mt-3 text-fg-muted">{t.alumniBody}</p>
      </Shell>
    );
  }

  return (
    /* «Подтвердить членство», а не «Вступить в клуб»: сюда ведёт кнопка «У
       меня есть код клуба», и экран с другим именем читался как не тот. И без
       абзаца-отговорки первым: он честный, но стоял раньше дела, ради
       которого пришли. Про новичков — после, одной строкой. */
    <Shell title={t.title}>
      <p className="mt-3 text-fg-muted">{t.lead}</p>

      <JoinForm status={profile.membershipStatus} t={dict.joinForm} />
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
