import type { Metadata } from "next";
import Link from "@/components/link";

import { buttonClass, cardClass } from "@/components/ui";
import { pluralize } from "@/lib/hikes/format";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { getStrikeSettings } from "@/lib/strikes-queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).rules;
  return { title: t.metaTitle, description: t.metaDescription };
}

/**
 * Страница для участников и для родителей.
 *
 * Тон здесь другой, чем на остальном сайте: спокойный и точный. Это
 * единственное место, где формальность уместна — по DESIGN.md.
 */
export default async function RulesPage() {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const t = dict.rules;
  const settings = await getStrikeSettings();
  const c = t.cancellations;
  // Числа — из настроек в базе: их правят в SQL-редакторе, и текст правил не
  // должен с ними разойтись. Нет настроек — абзацы с числами не печатаем.
  const count = (n: number) => pluralize(n, dict.strikes.count, locale);
  const cancellations = [
    c.cutoff,
    ...(settings
      ? [
          fill(c.weights, {
            late: count(settings.lateCancelWeight),
            noShow: count(settings.noShowWeight),
            lifetime: pluralize(settings.lifetimeHikes, dict.strikes.hikes, locale),
          }),
          fill(c.threshold, { threshold: count(settings.threshold) }),
        ]
      : []),
    c.excuse,
    c.privacy,
  ];

  return (
    // Контейнер как у шапки, а строка текста уже: иначе заголовок страницы
    // стоит не на той вертикали, что логотип, — на десктопе это заметные 48px.
    // Ширину строки ограничивает вложенный блок, а не контейнер. См. UI.md §1.
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-4 text-lg text-fg-muted">{t.lead}</p>

        <Block title={t.leader.title}>
          <List items={t.leader.items} />
        </Block>

        <Block title={t.participant.title}>
          <List items={t.participant.items} />
        </Block>

        {/* Сразу за обязанностями участника: отменить вовремя — одна из
            них, а здесь — что бывает, если нет. На этот раздел ссылается
            профиль, отсюда id. */}
        <Block id="cancellations" title={c.title}>
          <Paragraphs items={cancellations} />
        </Block>

        <Block title={t.lost.title}>
          <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-fg-muted marker:font-semibold marker:text-fg">
            {t.lost.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Block>

        <Block title={t.cancel.title}>
          <Paragraphs items={t.cancel.paragraphs} />
        </Block>

        {/* Второй абзац не убирать: «согласие» без него читается как галочка
            на сайте, и человек приезжает без бумаги. Бланков два, и детский
            подписывает родитель — а он не всегда оказывается рядом накануне
            выхода. */}
        <Block title={t.minors.title}>
          <Paragraphs items={t.minors.paragraphs} />
        </Block>

        <Block title={t.parents.title}>
          <Paragraphs items={t.parents.paragraphs} />
        </Block>

        <div className={cardClass({ className: "mt-10" })}>
          {/* Текст и кнопки говорят об одном: до 14 сентября 2026 текст звал
              к снаряжению, а главной стояла «Ближайшие походы», и одна
              страница называлась двумя именами — «Что взять с собой» и
              «Список снаряжения». */}
          <p className="text-fg-muted">{t.outro}</p>
          {/* Отсюда должен быть выход к походам: страницу пересылают в чате, и
              дочитавшему её дальше идти некуда. */}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/hikes"
              data-cta-anchor
              className={buttonClass({ variant: "primary" })}
            >
              {t.ctaHikes}
            </Link>
            <Link href="/gear-guide" className={buttonClass()}>
              {t.ctaGear}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function Block({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-20">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 text-fg-muted marker:text-fg-muted">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Paragraphs({ items }: { items: string[] }) {
  return items.map((text, i) => (
    <p key={text} className={`${i === 0 ? "mt-4" : "mt-3"} text-fg-muted`}>
      {text}
    </p>
  ));
}
