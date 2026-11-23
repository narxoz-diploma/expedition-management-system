"use client";

import { useEffect, useState } from "react";

import type { HikePhoto } from "@/lib/photos/queries";

/** Смена раз в семь секунд: быстрее — мельтешит, медленнее — не заметят. */
const INTERVAL_MS = 7000;

/**
 * Через сколько подгружать остальные кадры.
 *
 * Заведомо после первой отрисовки и задолго до первой смены на седьмой
 * секунде — то есть кадр успевает загрузиться, но не мешает открытию.
 */
const PRELOAD_DELAY_MS = 2000;

/**
 * Фон героя: один кадр или несколько, сменяющихся перетеканием.
 *
 * Клиентский компонент здесь оправдан — без таймера смены не бывает, — но
 * ровно на это. Сам герой, заголовок и кнопки остаются серверными.
 *
 * Чего тут нет намеренно: стрелок и точек-переключателей. Это фон, а не
 * галерея; управлять им никто не станет, а место они займут на самом узком
 * экране.
 */
export function HeroPhotos({ photos }: { photos: HikePhoto[] }) {
  const [index, setIndex] = useState(0);

  /*
   * Остальные кадры появляются в разметке только после монтирования.
   *
   * Фон с `opacity: 0` браузер всё равно грузит — пять снимков по паре сотен
   * килобайт задержали бы первую отрисовку главной ради того, что человек
   * увидит через семь секунд. Это та же ошибка, что мы уже лечили в
   * PERF.md, только в вёрстке.
   */
  const [rest, setRest] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setRest(true), PRELOAD_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (photos.length < 2) return;

    // Кому анимация мешает — тому один кадр. Это не украшение, от которого
    // можно отмахнуться: смена картинок на весь экран действительно мешает
    // людям с вестибулярными нарушениями.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const id = setInterval(
      () => setIndex((i) => (i + 1) % photos.length),
      INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [photos.length]);

  if (photos.length === 0) return null;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {(rest ? photos : photos.slice(0, 1)).map((photo, i) => (
        <div
          key={photo.id}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${photo.url})`,
            // Первый кадр видно сразу, остальные проявляются по очереди.
            opacity: i === index ? 1 : 0,
          }}
        />
      ))}
    </div>
  );
}
