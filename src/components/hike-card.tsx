import Link from "@/components/link";

import { CategoryScale } from "@/components/category-scale";
import { Chip } from "@/components/chip";
import { SpotsCounter, WentOnTrail } from "@/components/spots-counter";
import { cardClass } from "@/components/ui";
import { formatDateWithWeekday, formatNumber, formatTime } from "@/lib/hikes/format";
import { isPastHike, type Hike } from "@/lib/hikes/types";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import type { HikePhoto } from "@/lib/photos/queries";

/**
 * Карточка похода — «как билет»: крупно дата, маршрут, категория, набор
 * высоты, километраж и счётчик мест. Самый переиспользуемый компонент сайта.
 *
 * Язык узнаёт сама, а не пропсом: карточка стоит на шести страницах, и
 * протащенный через каждую язык — шесть мест, где его можно забыть.
 */
export async function HikeCard({
  hike,
  cover = null,
  status = null,
  now = new Date(),
}: {
  hike: Hike;
  /** Первый снимок альбома, если он есть. Отдельной загрузки под обложку нет. */
  cover?: HikePhoto | null;
  /**
   * Своя запись — «Место за тобой», «Лист ожидания, 3-й» — чипом первой строкой.
   * Раньше страница ставила её цветной строкой над карточкой, и статус жил
   * отдельно от похода, к которому относится.
   */
  status?: React.ReactNode;
  now?: Date;
}) {
  const locale = await getLocale();
  const t = getDictionary(locale).hikeCard;
  const past = isPastHike(hike, now);

  const stats = [
    hike.distanceKm !== null && fill(t.km, { n: formatNumber(hike.distanceKm, locale) }),
    hike.elevationGainM !== null && fill(t.gain, { n: hike.elevationGainM }),
    hike.durationHours !== null && fill(t.hours, { n: formatNumber(hike.durationHours, locale) }),
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/hikes/${hike.slug}`}
      className={cardClass({
        flush: cover !== null,
        className: "block transition-colors hover:bg-surface-raised",
      })}
    >
      {/* Обложка — первый снимок альбома, отдельной загрузки под неё нет.
          Нет снимков — карточка выглядит как раньше, никакой работы лидеру
          это не добавляет. */}
      {cover && (
        /* eslint-disable-next-line @next/next/no-img-element --
           снимки уже сжаты при загрузке, оптимизатор Vercel тратил бы квоту.

           3:2, а не 16:9: камеры и телефоны снимают в 3:2 и 4:3, и широкая
           рамка срезала у кадра четверть по вертикали — оставалась середина
           без верха и низа, отчего гора выглядела снятой в упор.

           srcset вместо одной миниатюры: карточка на широком экране почти
           720px, и миниатюра 600px в ней растягивалась. Теперь браузер сам
           берёт миниатюру на телефон и полный кадр на десктоп — новых
           размеров при загрузке городить не пришлось. */
        <img
          src={cover.thumbUrl}
          srcSet={`${cover.thumbUrl} 600w, ${cover.url} 2000w`}
          sizes="(min-width: 768px) 720px, 100vw"
          alt=""
          loading="lazy"
          className="aspect-3/2 w-full object-cover"
        />
      )}

      <div className={cover ? "p-5" : ""}>
      {status && <div className="mb-3">{status}</div>}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Дата — не действие, поэтому не оранжевая: когда акцентом набраны
              даты, главная кнопка экрана теряется среди них. */}
          <p className="text-sm font-semibold text-fg-muted">
            {/* Год — только у прошедших: вкладка истории живёт несколько
                сезонов, и «18 мая» в ней двусмысленно. */}
            {formatDateWithWeekday(hike.startsAt, past, locale)}
          </p>
          <h3 className="mt-1 text-xl leading-tight font-extrabold tracking-tight text-fg">
            {hike.routeName ?? hike.title}
          </h3>
        </div>
        <CategoryScale category={hike.category} />
      </div>

      {stats.length > 0 && (
        <p className="mt-3 text-sm text-fg-muted">{stats.join(" · ")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-fg-muted">
          {fill(past ? t.startPast : t.start, { time: formatTime(hike.startsAt, locale) })}
        </span>
        {hike.status === "cancelled" ? (
          <span className="text-sm font-medium text-danger">{t.cancelled}</span>
        ) : past ? (
          <WentOnTrail hike={hike} />
        ) : (
          <SpotsCounter hike={hike} />
        )}
      </div>

      {/* «Можно новичкам» — приглашение, а звать в поход, который уже
          состоялся, некуда. */}
      {hike.openToNewcomers && hike.status !== "cancelled" && !past && (
        /* Метка, а не плашка состояния: `rounded-full` и по ширине текста —
           полоса во всю карточку читалась как предупреждение. */
        <div className="mt-3">
          <Chip tone="outline">{t.newcomers}</Chip>
        </div>
      )}
      </div>
    </Link>
  );
}
