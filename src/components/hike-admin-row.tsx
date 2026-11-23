import Link from "@/components/link";

import { Chip } from "@/components/chip";
import { cardClass, type ChipTone } from "@/components/ui";
import type { Hike } from "@/lib/hikes/types";

const STATUS_LABELS: Record<Hike["status"], string> = {
  draft: "Черновик",
  published: "Идёт набор",
  cancelled: "Отменён",
  completed: "Прошёл",
};

/**
 * Черновику — accent, а не warning: по docs/UI.md жёлтый читается как «что-то
 * не так», а тут ничего не сломано, просто нужно действие. Жёлтый — только
 * «Нужен итог»: поход прошёл, а отметок нет, и без них новички не станут
 * участниками клуба.
 */
const STATUS_TONES: Record<Hike["status"], ChipTone> = {
  draft: "accent",
  published: "success",
  cancelled: "danger",
  completed: "neutral",
};

/**
 * Строка похода в списке управления — одна ссылка в группу похода.
 *
 * До 14 сентября 2026 в строке стояли четыре кнопки: «Группа» акцентом,
 * «Править», «Посмотреть» и «Опубликовать». Акцентная «Группа» в каждой
 * строке нарушала «одна главная кнопка на экран», ряд переносился по-разному
 * у разных походов, а публикация одним нажатием без подтверждения прятала
 * поход с записавшимися. Всё это теперь живёт на экране группы, по фазам
 * похода; сюда приходят выбрать поход.
 */
export function HikeAdminRow({
  hike,
  dateLabel,
  needsOutcome,
}: {
  hike: Hike;
  dateLabel: string;
  /** Опубликованный поход уже начался, а итог не отмечен. */
  needsOutcome: boolean;
}) {
  const chip: { label: string; tone: ChipTone } = needsOutcome
    ? { label: "Нужен итог", tone: "warning" }
    : { label: STATUS_LABELS[hike.status], tone: STATUS_TONES[hike.status] };

  return (
    <li>
      <Link
        href={`/admin/hikes/${hike.id}`}
        className={cardClass({
          className: "flex items-center gap-4 transition-colors hover:bg-surface-raised",
        })}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg-muted">{dateLabel}</p>
            <Chip tone={chip.tone}>{chip.label}</Chip>
          </div>
          <h3 className="mt-1 text-lg leading-tight font-extrabold tracking-tight text-fg">
            {hike.routeName ?? hike.title}
          </h3>
          <p className="mt-1 text-sm text-fg-muted">
            Категория {hike.category} · записано {hike.confirmedCount} из{" "}
            {hike.capacity}
            {hike.waitlistCount > 0 && ` · в очереди ${hike.waitlistCount}`}
          </p>
        </div>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 shrink-0 text-fg-muted"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    </li>
  );
}
