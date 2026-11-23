"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setGearItem } from "@/app/actions/gear";
import type { GearOwnership, MyGearItem } from "@/lib/gear-readiness";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { fill } from "@/lib/i18n/fill";

/**
 * Заголовок группы. Строчными, а не капсом, и без «Снаряжение» на экране
 * «Снаряжение» — так группа называлась в справочнике. Подписи — от сервера
 * на языке страницы; незнакомая группа — как в базе, с заглавной.
 */
function groupTitle(group: string, titles: Record<string, string>): string {
  return titles[group.toLowerCase()] ?? group.charAt(0).toUpperCase() + group.slice(1);
}

export function GearForm({
  items,
  t,
  groupTitles,
}: {
  /** Названия вещей уже на языке страницы — переводит сервер. */
  items: MyGearItem[];
  /** Кусок словаря пропсом: компонент клиентский. */
  t: Dictionary["gearForm"];
  groupTitles: Record<string, string>;
}) {
  // «Достану», а не «Одолжу»: прежняя подпись читалась и как «я одолжу кому-то»,
  // и как «мне одолжат», а второе выглядело обещанием клуба выдать снаряжение.
  const options: { value: GearOwnership; label: string }[] = [
    { value: "own", label: t.own },
    { value: "will_get", label: t.willGet },
    { value: "none", label: t.none },
  ];

  const router = useRouter();
  const [, startTransition] = useTransition();
  const [marks, setMarks] = useState<Record<string, GearOwnership>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.ownership])),
  );
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Record<string, string>>({});

  // Группируем по назначению — так список читается как сборы, а не как анкета.
  // Внутри группы — по категории: «Спальник, с 5» стоял среди третьей, а
  // «Аптечка, с 2» после «Очков, с 3». Сортировка стабильная, так что внутри
  // одной категории остаётся порядок справочника.
  const groups = new Map<string, MyGearItem[]>();
  for (const item of items) {
    const key = item.category ?? "прочее";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.minHikeCategory - b.minHikeCategory);
  }

  function choose(item: MyGearItem, ownership: GearOwnership) {
    const previous = marks[item.id];
    if (previous === ownership) return;

    setMarks((m) => ({ ...m, [item.id]: ownership }));
    setFailed((f) => {
      const next = { ...f };
      delete next[item.id];
      return next;
    });
    setSaving((s) => new Set(s).add(item.id));

    startTransition(async () => {
      const result = await setGearItem(item.id, ownership);
      setSaving((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
      if (result.message) {
        // Отметка возвращается назад: иначе на экране «Есть», а в базе нет,
        // и лидер увидит не то, что человек думает, что отметил.
        setMarks((m) => ({ ...m, [item.id]: previous }));
        setFailed((f) => ({ ...f, [item.id]: result.message! }));
        return;
      }
      // Сводка наверху считается на сервере — обновляем её.
      router.refresh();
    });
  }

  return (
    <div className="mt-8">
      <p className="text-fg-muted">{t.intro}</p>

      <div className="mt-8 flex flex-col gap-10">
        {[...groups.entries()].map(([group, groupItems]) => (
          <section key={group}>
            <h2 className="text-lg font-bold">{groupTitle(group, groupTitles)}</h2>

            <ul className="mt-4 flex flex-col gap-5">
              {groupItems.map((item) => (
                <li key={item.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-fg">{item.name}</span>
                    <span className="text-sm text-fg-muted">
                      {saving.has(item.id)
                        ? t.saving
                        : fill(t.fromCategory, { n: item.minHikeCategory })}
                    </span>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label={item.name}
                    className="mt-2 grid grid-cols-3 gap-2"
                  >
                    {options.map((option) => (
                      <label
                        key={option.value}
                        // Сама радиокнопка скрыта, поэтому кольцо фокуса
                        // рисуем на подписи — иначе при управлении с
                        // клавиатуры не видно, где находишься.
                        className="flex h-tap cursor-pointer items-center justify-center rounded-xl bg-surface-raised text-sm font-medium text-fg-muted has-checked:bg-fg has-checked:font-semibold has-checked:text-bg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500"
                      >
                        <input
                          type="radio"
                          name={`gear:${item.id}`}
                          value={option.value}
                          checked={marks[item.id] === option.value}
                          onChange={() => choose(item, option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  {failed[item.id] && (
                    <p role="alert" className="mt-2 text-sm text-danger">
                      {failed[item.id]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
