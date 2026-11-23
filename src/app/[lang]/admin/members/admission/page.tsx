import type { Metadata } from "next";

import { BackLink } from "@/components/back-link";
import { CopyButton } from "@/components/copy-button";
import {
  ApplicantRow,
  InviteCodeForm,
  PhoneImportForm,
} from "@/components/members-admin";
import { buttonClass, cardClass } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth-guards";
import { formatDate, pluralWithNumber } from "@/lib/hikes/format";
import { listApplicants, listInviteCodes, listKnownPhones } from "@/lib/members";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Приём в клуб",
  robots: { index: false },
};

/**
 * Всё про членство: заявки, список номеров, коды семестра, гости.
 *
 * Отдельно от справочника намеренно. Раньше всё это жило на одной странице
 * с заявками, и она отвечала сразу на два разных вопроса — «как принять
 * человека» и «кто у нас есть». С 14 сентября 2026 сюда переехали и заявки:
 * они стояли в двух местах сразу (решение автора — в одном).
 */
export default async function AdmissionPage() {
  await requireStaffPage("/admin/members/admission");

  const [{ pending, guests }, phones, codes] = await Promise.all([
    listApplicants(),
    listKnownPhones(),
    listInviteCodes(),
  ]);

  // Есть в группе, но профиль ещё не завёл — готовый список, кому напомнить.
  const notRegistered = phones.filter((p) => !p.matched);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink href="/admin/members">Участники</BackLink>

      <h1 className="mt-4 text-2xl font-bold">Приём в клуб</h1>

      {/* Заявки первыми: это единственное здесь, что ждёт ответа. */}
      <Section title={`Заявки — ${pending.length}`}>
        {pending.length === 0 ? (
          <p className="text-fg-muted">Новых заявок нет.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((applicant) => (
              <ApplicantRow key={applicant.id} applicant={applicant} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Список номеров из группы"
        hint="Самый быстрый способ перенести на сайт тех, кто в клубе давно."
      >
        <PhoneImportForm />

        {notRegistered.length > 0 && (
          <div className={cardClass({ dense: true, className: "mt-6" })}>
            <p className="font-medium text-fg">
              Есть в группе, но профиль не завели —{" "}
              {pluralWithNumber(
                notRegistered.length,
                "человек",
                "человека",
                "человек",
              )}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Готовый список, кому напомнить про сайт.
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
              {notRegistered.slice(0, 40).map((phone) => (
                <li key={phone.phone} className="whitespace-nowrap">
                  {formatPhone(phone.phone)}
                </li>
              ))}
            </ul>
            {notRegistered.length > 40 && (
              <p className="mt-2 text-sm text-fg-muted">
                и ещё {notRegistered.length - 40}
              </p>
            )}
            {/* Все номера, а не видимые сорок: список нужен, чтобы вставить
                его в рассылку, а переписывать номера с экрана никто не будет. */}
            <CopyButton
              text={notRegistered.map((phone) => phone.phone).join("\n")}
              label="Скопировать все номера"
              copiedLabel="Скопировано"
              className={buttonClass({ size: "sm", className: "mt-4" })}
            />
          </div>
        )}
      </Section>

      <Section title="Коды семестра" hint="Код вводят в профиле при вступлении.">
        <InviteCodeForm />

        {codes.length > 0 && (
          <ul className="mt-6 flex flex-col gap-2">
            {codes.map((code) => (
              <li
                key={code.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2"
              >
                <span className="font-mono font-medium text-fg">{code.code}</span>
                <span className="text-sm text-fg-muted">
                  {code.label && `${code.label} · `}
                  использован {pluralWithNumber(code.uses, "раз", "раза", "раз")}
                  {code.expiresAt && ` · до ${formatDate(code.expiresAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Свёрнуто и без главных кнопок: до 14 сентября 2026 здесь стояло 243
          оранжевых «Подтвердить» под текстом «вмешиваться обычно не нужно».
          Гость подтверждается сам после первого похода. */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Гости — {guests.length}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Зарегистрировались, но членство пока не подтверждено. Подтвердится само
          после первого пройденного похода — вмешиваться обычно не нужно.
        </p>
        {guests.length > 0 && (
          <details className="mt-4 rounded-2xl bg-surface px-4 py-2">
            <summary className="flex min-h-tap cursor-pointer items-center font-semibold text-fg">
              Показать список
            </summary>
            <ul className="flex flex-col gap-3 pt-2 pb-3">
              {guests.map((applicant) => (
                <ApplicantRow key={applicant.id} applicant={applicant} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
