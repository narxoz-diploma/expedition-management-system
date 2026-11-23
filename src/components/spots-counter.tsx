import { pluralize } from "@/lib/hikes/format";
import {
  runningOutThreshold,
  spotsLeft,
  totalOnTrail,
  type Hike,
} from "@/lib/hikes/types";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";

async function spotsText() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale).spots };
}

/**
 * «Осталось 4 из 25».
 *
 * По DESIGN.md это отдельный акцент: счётчик работает лучше любого призыва
 * к действию, потому что показывает, что событие живое и заполняется.
 *
 * Цветов ровно два, и светофора здесь не будет намеренно. Красный и зелёный
 * заняты состояниями — зелёное «много мест» столкнулось бы с зелёным «место
 * за тобой». А главное, подробная шкала дефицита — это давление: она торопит
 * там, где торопиться незачем, потому что есть лист ожидания и очередь
 * реально двигается. `PROJECT.md` §4: безопасность важнее вовлечения.
 */
export async function SpotsCounter({
  hike,
  className = "",
}: {
  hike: Hike;
  className?: string;
}) {
  const { locale, t } = await spotsText();
  const left = spotsLeft(hike);

  // Пока запись не открыта, «Осталось 25 из 25» читалось приглашением
  // записаться, которого нет. До открытия — просто размер группы.
  if (
    hike.registrationOpensAt !== null &&
    new Date(hike.registrationOpensAt) > new Date()
  ) {
    return (
      <span className={`text-sm font-medium text-fg-muted ${className}`}>
        {pluralize(hike.capacity, t.capacity, locale)}
      </span>
    );
  }

  if (left === 0) {
    return (
      /* Не жёлтым: «мест нет» — это факт и приглашение в очередь, а не
         предупреждение. Жёлтый читался как «что-то пошло не так», хотя
         очередь двигается и шанс пойти вполне реальный. */
      <span className={`text-sm font-medium text-fg-muted ${className}`}>
        {t.full}
        {hike.waitlistCount > 0 &&
          fill(t.fullQueue, { people: pluralize(hike.waitlistCount, t.people, locale) })}
      </span>
    );
  }

  // Последние места выделяем: это честная информация, а не давление —
  // человек действительно может не успеть. Порог считается от вместимости,
  // см. runningOutThreshold().
  const runningOut = left <= runningOutThreshold(hike.capacity);

  return (
    <span
      className={`text-sm font-medium ${runningOut ? "text-fg" : "text-fg-muted"} ${className}`}
    >
      {fill(t.left, { left, capacity: hike.capacity })}
    </span>
  );
}

/**
 * «Ходили 18 человек» — итог прошедшего похода вместо счётчика мест.
 *
 * Свободные места у похода, который уже состоялся, — не просто бесполезная
 * цифра, а приглашение записаться в прошлое. Здесь же число работает как
 * портфолио: видно, что клуб реально ходит и сколько людей собирает.
 *
 * Молчит при нуле: у старых походов, залитых в базу без состава, «ходили 0
 * человек» читалось бы как «никто не пришёл».
 */
export async function WentOnTrail({
  hike,
  className = "",
}: {
  hike: Hike;
  className?: string;
}) {
  const total = totalOnTrail(hike);
  if (total === 0) return null;
  const { locale, t } = await spotsText();

  return (
    <span className={`text-sm font-medium text-fg-muted ${className}`}>
      {fill(t.went, { people: pluralize(total, t.people, locale) })}
    </span>
  );
}

/**
 * «На маршруте будет 12 человек» — участники плюс лидеры.
 *
 * Вместимость означает места для участников, лидеры идут сверх неё. Без этой
 * строки лидер, поставивший 15, не догадается, что реально выйдет 17, — а от
 * общего числа зависит и транспорт, и допустимый размер группы на тропе.
 */
export async function TotalOnTrail({ hike }: { hike: Hike }) {
  const total = totalOnTrail(hike);
  if (total === 0) return null;
  const { locale, t } = await spotsText();
  const leaders = pluralize(hike.leaderCount, t.leaders, locale);

  // Пока участников нет, «На маршруте 5 человек, из них 5 лидеров» — одно и
  // то же число дважды.
  if (hike.confirmedCount === 0) {
    return (
      <span className="text-sm text-fg-muted">
        {fill(hike.leaderCount === 1 ? t.leadOne : t.leadMany, { leaders })}
      </span>
    );
  }

  return (
    <span className="text-sm text-fg-muted">
      {fill(t.onTrail, { people: pluralize(total, t.people, locale) })}
      {hike.leaderCount > 0 && fill(t.ofThem, { leaders })}
    </span>
  );
}
