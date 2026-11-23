"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  addHikePhotos,
  deleteHikePhoto,
  reorderHikePhotos,
  setPhotoFeatured,
} from "@/app/actions/photos";
import { calloutClass } from "@/components/ui";
import type { HikePhoto } from "@/lib/photos/queries";
import { uploadHikePhotos, type UploadProgress } from "@/lib/photos/upload";

/**
 * Фотографии похода: загрузка, обложка, удаление.
 *
 * Порядок меняется кнопкой «Сделать обложкой», а не перетаскиванием.
 * Перетаскивание пальцем по сетке — источник багов на телефоне (оно дерётся
 * с прокруткой страницы), а нужен лидеру ровно один порядок: какой снимок
 * пойдёт на карточку. Одна кнопка решает это в одно касание.
 */
export function HikePhotosEditor({
  hikeId,
  photos,
}: {
  hikeId: string;
  photos: HikePhoto[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Загрузились, но для обложки мелковаты — это совет, а не ошибка. */
  const [small, setSmall] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setMessage(null);
    setSmall([]);
    const { uploaded, failed, small } = await uploadHikePhotos(
      hikeId,
      files,
      setProgress,
    );
    setProgress(null);
    setSmall(small);

    // Сбрасываем поле: иначе повторный выбор тех же файлов не сработает —
    // значение не изменилось, и события не будет.
    if (input.current) input.current.value = "";

    if (uploaded.length > 0) {
      const result = await addHikePhotos(hikeId, uploaded);
      if (result.message) {
        setMessage(result.message);
        return;
      }
    }

    setMessage(
      failed.length > 0
        ? `Не загрузились: ${failed.join(", ")}. Попробуй ещё раз — остальные на месте.`
        : null,
    );
    router.refresh();
  }

  function makeCover(photoId: string) {
    // Порядок целиком, а не «поменять два местами»: остальные снимки едут на
    // позицию вниз, и это ровно то, чего ждёт человек.
    const order = [photoId, ...photos.filter((p) => p.id !== photoId).map((p) => p.id)];
    startTransition(async () => {
      const result = await reorderHikePhotos(hikeId, order);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  function toggleFeatured(photoId: string, featured: boolean) {
    startTransition(async () => {
      const result = await setPhotoFeatured(photoId, featured);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  function remove(photoId: string) {
    startTransition(async () => {
      const result = await deleteHikePhoto(photoId);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  const busy = progress !== null || pending;

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">Фотографии — {photos.length}</h2>
      <p className="mt-2 text-fg-muted">
        Первая по порядку становится обложкой — она видна в списке походов.
        Снимки сжимаются прямо здесь, грузить уменьшенные заранее не нужно.
      </p>
      {/* Предупреждение здесь, а не в коде: кодом это не проверить, а цена
          ошибки реальная — человек одевается по картинке. */}
      <p className="mt-2 text-sm text-fg-muted">
        Если ставишь обложку будущему походу, следи за сезоном: летний кадр на
        февральском выходе врёт про условия сильнее, чем его отсутствие.
      </p>

      {message && (
        <p
          role="alert"
          className={calloutClass({ tone: "danger", compact: true, className: "mt-4 text-sm" })}
        >
          {message}
        </p>
      )}

      {/* Жёлтым, а не красным: снимок загрузился и в плитке галереи
          смотрится нормально — плохо ему только во всю ширину карточки.
          Красный тут читался бы как «ничего не вышло». */}
      {small.length > 0 && (
        <div className={calloutClass({ tone: "warning", className: "mt-4 text-sm" })}>
          <p className="font-medium text-fg">
            Мелковато для обложки: {small.join(", ")}
          </p>
          <p className="mt-2 text-fg-muted">
            В галерее плиткой сойдёт, а во всю ширину карточки будет размыто.
            Так выглядят фотографии, сохранённые из чата: мессенджеры сжимают
            их при отправке. Полный кадр остаётся, если файл отправляли без
            сжатия — или взять оригинал у автора.
          </p>
        </div>
      )}

      {/* Своя плитка вместо системного поля: браузер подписывает его на языке
          системы — «Choose Files / No file chosen» посреди русского экрана.
          Пунктирная плитка, а не обычная кнопка: кнопкой она вставала в ряд
          с «Снять с публикации» ниже и читалась как ещё одно действие с
          походом (замечание автора, 14 сентября 2026). */}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="mt-4 flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line px-4 py-4 text-fg-muted transition-colors hover:border-fg-muted hover:text-fg disabled:opacity-60"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="text-sm font-semibold">
          {busy ? "Загружаем…" : "Добавить фото"}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={onPick}
        className="hidden"
      />

      {/* Прогресс обязателен: пятнадцать снимков с телефона — это минуты, а
          молчащая кнопка на две минуты выглядит как зависший сайт. */}
      {progress && (
        <p className="mt-3 text-sm text-fg-muted" aria-live="polite">
          {progress.stage === "resize" ? "Сжимаем" : "Загружаем"}{" "}
          {progress.index + 1} из {progress.total} — {progress.fileName}
        </p>
      )}

      {photos.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <li key={photo.id} className="overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element --
                  next/image здесь не нужен: снимки уже сжаты до 600px в
                  браузере, а оптимизатор Vercel на них тратил бы квоту. */}
              <img
                src={photo.thumbUrl}
                alt=""
                loading="lazy"
                className="aspect-4/3 w-full object-cover"
              />
              <div className="flex flex-col gap-2 p-3">
                {i === 0 ? (
                  <span className="text-sm font-semibold text-fg">Обложка</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => makeCover(photo.id)}
                    className="text-left text-sm text-fg-muted underline underline-offset-4 disabled:opacity-60"
                  >
                    Сделать обложкой
                  </button>
                )}
                {/* Отметка на главную — здесь же, а не в отдельной админке:
                    лидер и так разбирает снимки на этом экране. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleFeatured(photo.id, !photo.featured)}
                  className="text-left text-sm text-fg-muted underline underline-offset-4 disabled:opacity-60"
                >
                  {photo.featured ? "Убрать с главной" : "На главную"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(photo.id)}
                  className="text-left text-sm text-danger underline underline-offset-4 disabled:opacity-60"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {photos.length === 0 && !progress && (
        <p className="mt-4 text-sm text-fg-muted">
          Пока пусто. Фотографии видны на странице похода, а лучшие — на главной.
        </p>
      )}
    </section>
  );
}
