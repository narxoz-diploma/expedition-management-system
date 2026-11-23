import type { HikeCategory } from "@/lib/hikes/types";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";

// Классы перечислены целиком, а не собраны как `bg-cat-${n}`: Tailwind ищет
// имена классов по исходнику текстом и склеенные на лету просто не находит.
const FILLED: Record<HikeCategory, string> = {
  1: "bg-cat-1",
  2: "bg-cat-2",
  3: "bg-cat-3",
  4: "bg-cat-4",
  5: "bg-cat-5",
};

/**
 * Шкала сложности 1–5. Одинаковая везде: в карточке, в списке, в фильтре —
 * чтобы её значение считывалось без подписи.
 */
export async function CategoryScale({
  category,
  withLabel = false,
}: {
  category: HikeCategory;
  withLabel?: boolean;
}) {
  const dict = getDictionary(await getLocale());
  const name = dict.categories[category];
  const label = fill(dict.categoryScale.title, { n: category, label: name });

  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="flex gap-1" aria-hidden="true">
        {([1, 2, 3, 4, 5] as const).map((step) => (
          <span
            key={step}
            className={`h-1.5 w-4 rounded-full ${
              step <= category ? FILLED[category] : "bg-line"
            }`}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
      {withLabel && (
        <span className="text-sm text-fg-muted" aria-hidden="true">
          {name}
        </span>
      )}
    </span>
  );
}
