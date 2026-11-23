import type { Metadata } from "next";
import Link from "@/components/link";

import { CategoryScale } from "@/components/category-scale";
import { Chip } from "@/components/chip";
import { buttonClass, cardClass } from "@/components/ui";
import type { HikeCategory } from "@/lib/hikes/types";
import { listGear, listMyGear } from "@/lib/gear";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { gearGroupTitles } from "@/lib/i18n/gear-groups";
import { getLocale } from "@/lib/i18n/server";
import { getCurrentProfile } from "@/lib/profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale()).gearGuide;
  return { title: t.metaTitle, description: t.metaDescription };
}

/**
 * Самый частый вопрос новичка и самая пересылаемая ссылка после карточки
 * похода. Поэтому отдельная страница, а не абзац внутри правил.
 *
 * Список берётся из справочника в базе, а не написан здесь руками: у каждого
 * пункта в базе указано, с какой категории он обязателен, и дублировать это
 * значит однажды разойтись с чеклистом, который видит лидер.
 */
export default async function GearGuidePage() {
  const [gear, profile, locale] = await Promise.all([
    listGear(),
    getCurrentProfile(),
    getLocale(),
  ]);
  const dict = getDictionary(locale);
  const t = dict.gearGuide;
  // Названия и группы в базе русские; перевод — по slug и по слову группы, а
  // незнакомое, заведённое руками в SQL, остаётся как в базе.
  const names: Record<string, string> = dict.gearItems;
  const groups = gearGroupTitles(dict.gearGroups);

  // Вошедшему — его отметки прямо в списке: сверять собранное хочется именно
  // здесь, а до 14 сентября 2026 он видел тот же общий список, что гость.
  const mine = new Map(
    (profile ? await listMyGear() : []).map((item) => [item.id, item.ownership]),
  );

  const byCategory = ([1, 2, 3, 4, 5] as const).map((category) => ({
    category,
    // Что добавляется именно на этой категории — а не весь список заново.
    items: gear.filter((item) => item.minHikeCategory === category),
  }));

  return (
    // Контейнер как у шапки, а строка текста уже: иначе заголовок страницы
    // стоит не на той вертикали, что логотип. См. docs/UI.md §1.
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-4 text-lg text-fg-muted">{t.lead}</p>

        {/* Абзац делит список не по важности, а по деньгам. Новичок
            спотыкается не о длину списка, а о мысль «мне надо всё это
            купить», — и половина первой категории лежит у него дома. */}
        <p className={cardClass({ dense: true, className: "mt-4 text-fg-muted" })}>
          {t.buyNote}
        </p>

        {profile && gear.length > 0 && (
          <Link
            href="/profile/gear"
            className={buttonClass({ size: "sm", className: "mt-4" })}
          >
            {mine.size > 0 ? t.editMarks : t.markMine}
          </Link>
        )}

        {gear.length === 0 ? (
          <p className="mt-8 text-fg-muted">{t.empty}</p>
        ) : (
          <div className="mt-10 flex flex-col gap-10">
            {byCategory.map(({ category, items }) => (
              <section key={category}>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-bold">{fill(t.category, { n: category })}</h2>
                  <CategoryScale category={category as HikeCategory} />
                </div>
                <p className="mt-1 text-sm text-fg-muted">{dict.categories[category]}</p>

                {items.length === 0 ? (
                  <p className="mt-4 text-fg-muted">{t.nothingNew}</p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-2">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-baseline justify-between gap-4 border-b border-line pb-2"
                      >
                        <span className="text-fg">{names[item.slug] ?? item.name}</span>
                        {/* Слова отметок — те же, что на кнопках «Моего
                            снаряжения», чтобы одно и то же не звалось
                            по-разному на двух экранах. */}
                        {mine.get(item.id) === "own" ? (
                          <Chip tone="success">{dict.gearForm.own.toLowerCase()}</Chip>
                        ) : mine.get(item.id) === "will_get" ? (
                          <Chip tone="warning">{dict.gearForm.willGet.toLowerCase()}</Chip>
                        ) : (
                          item.category && (
                            <span className="shrink-0 text-sm text-fg-muted">
                              {groups[item.category] ?? item.category}
                            </span>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        <div className={cardClass({ className: "mt-10" })}>
          <p className="text-fg-muted">{t.outro}</p>
          {/* Отсюда должен быть выход к походам: на эту страницу приходят по
              ссылке из чата, и дочитавшему её дальше идти некуда. */}
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/hikes"
              data-cta-anchor
              className={buttonClass({ variant: "primary" })}
            >
              {t.ctaHikes}
            </Link>
            <Link href="/rules" className={buttonClass()}>
              {t.ctaRules}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
