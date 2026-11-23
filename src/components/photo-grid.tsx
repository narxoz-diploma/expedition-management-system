import type { HikePhoto } from "@/lib/photos/queries";

/**
 * Сетка снимков.
 *
 * Полноразмерный кадр открывается обычной ссылкой в новой вкладке, а не
 * своим просмотрщиком. Просмотрщик — это клиентский компонент, клавиатура,
 * свайпы, блокировка прокрутки и фокус-ловушка; всё это ради того, что
 * браузер уже умеет. Если однажды понадобится листать не выходя со
 * страницы, надстроить будет чем — сетка от этого не зависит.
 *
 * Грузятся миниатюры (600px), полный кадр — только по нажатию. Иначе
 * страница похода с пятнадцатью снимками весила бы мегабайты, а смотрят их
 * далеко не все.
 */
export function PhotoGrid({
  photos,
  className = "",
}: {
  photos: HikePhoto[];
  className?: string;
}) {
  if (photos.length === 0) return null;

  return (
    <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${className}`}>
      {photos.map((photo) => (
        <li key={photo.id}>
          <a
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                снимки уже сжаты в браузере при загрузке, оптимизатор Vercel
                тратил бы на них квоту, ничего не улучшая. */}
            <img
              src={photo.thumbUrl}
              alt=""
              loading="lazy"
              className="aspect-4/3 w-full object-cover transition-opacity hover:opacity-90"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
