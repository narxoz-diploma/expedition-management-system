import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { ProfileForm } from "@/components/profile-form";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { localizeHref, pathWithoutLocale } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
import { getCurrentProfile, getEmergencyContacts, missingFieldKeys } from "@/lib/profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).profile;
  return { title: t.metaTitle, robots: { index: false } };
}

/** Возвращаем только на внутренние страницы — см. /auth/callback. */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/profile";
  return value;
}

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [params, profile, locale] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    getLocale(),
  ]);
  // Куда вернуть после сохранения — на том же языке: ссылки сюда собираются
  // по адресу без языка (`/hikes/…` из блока записи), и без этого человек с
  // английской страницы после сохранения попадал бы на русскую.
  const next = localizeHref(safeNext(params.next), locale);

  if (!profile) {
    redirect(
      localizeHref(`/login?next=${encodeURIComponent(`/profile/edit?next=${next}`)}`, locale),
    );
  }

  const dict = getDictionary(locale);
  const t = dict.profileEdit;
  const contacts = await getEmergencyContacts();
  const missing = missingFieldKeys(profile, contacts).map((key) => dict.profileFields[key]);
  // Человек пришёл сюда с карточки похода — значит объясняем, зачем это, и
  // показываем, что осталось. Иначе форма выглядит как препятствие.
  const cameFromHike = pathWithoutLocale(next).startsWith("/hikes/");

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* Путь назад — туда, откуда пришли: рядом с «Сохранить» не было ни
          «назад», ни «отмены», и передумавший уходил только кнопкой браузера. */}
      <BackLink href={next}>{cameFromHike ? t.backHike : t.backProfile}</BackLink>

      <h1 className="mt-4 text-2xl font-bold">{missing.length > 0 ? t.titleMissing : t.title}</h1>

      {cameFromHike && missing.length > 0 ? (
        <p className="mt-3 text-fg-muted">{fill(t.fromHike, { fields: missing.join(", ") })}</p>
      ) : (
        <p className="mt-3 text-fg-muted">{t.lead}</p>
      )}

      <ProfileForm
        profile={profile}
        contact={contacts[0] ?? null}
        next={next}
        t={dict.profileForm}
        fitnessLabels={dict.fitnessLevels}
      />
    </main>
  );
}
