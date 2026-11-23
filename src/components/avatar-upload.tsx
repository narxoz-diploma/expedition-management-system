"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { saveAvatar } from "@/app/actions/profile";
import { buttonClass, calloutClass } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { uploadAvatar } from "@/lib/photos/upload";

/**
 * Своё фото вместо аватара от Google.
 *
 * Живёт на странице профиля, а не в форме мини-профиля: там шесть полей на
 * пути к записи, и каждое лишнее — потерянные люди. Фото добирается потом и
 * добровольно, как и снаряжение.
 *
 * У большинства в профиле лежит ссылка на картинку из Google-аккаунта, и
 * это чаще всего не лицо, а буква или стандартный кружок. Поэтому кнопка
 * есть всегда, а не только когда аватара нет вовсе.
 */
export function AvatarUpload({
  userId,
  avatarUrl,
  fullName,
  t,
}: {
  userId: string;
  avatarUrl: string | null;
  fullName: string;
  /** Кусок словаря пропсом: компонент клиентский. */
  t: Dictionary["avatar"];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setMessage(null);
    try {
      const path = await uploadAvatar(userId, file);
      const result = await saveAvatar(path);
      if (result.message) setMessage(result.message);
      else router.refresh();
    } catch (error) {
      console.error("Не удалось загрузить аватар", error);
      setMessage(t.failed);
    } finally {
      setBusy(false);
      // Иначе повторный выбор того же файла не даст события.
      if (input.current) input.current.value = "";
    }
  }

  const pick = () => input.current?.click();

  return (
    <div>
      <div className="flex items-center gap-4">
        {/* Сам аватар тоже нажимается, со значком камеры в углу: так фото
            меняют почти во всех приложениях, и жест узнаётся без подписи.
            Из порядка табуляции убран — рядом та же команда текстом, и
            дважды одно действие клавиатуре и экранному диктору ни к чему.

            До 14 сентября 2026 здесь была одна ghost-кнопка: её внутренний
            отступ сдвигал подпись вправо от подсказки под ней, и блок
            выглядел собранным наугад. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={busy}
          onClick={pick}
          className="relative size-18 shrink-0 rounded-full disabled:cursor-not-allowed"
        >
          <span
            className={`block size-full overflow-hidden rounded-full bg-surface-raised transition-opacity ${busy ? "opacity-50" : ""}`}
          >
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element --
                 аватар уже сжат до 512px, оптимизатор Vercel тратил бы квоту. */
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-2xl font-bold text-fg-muted">
                {fullName.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full border-2 border-bg bg-surface-raised text-fg">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </span>
        </button>

        {/* Подсказки «квадрат по центру кадра» здесь больше нет: заранее фото
            никто не обрезает, и строка только удлиняла блок (решение автора,
            14 сентября 2026). Кадрирование по центру делает сама загрузка. */}
        <button
          type="button"
          disabled={busy}
          onClick={pick}
          className={buttonClass({ size: "sm" })}
        >
          {busy ? t.uploading : avatarUrl ? t.change : t.add}
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="hidden"
      />

      {message && (
        <p
          role="alert"
          className={calloutClass({ tone: "danger", compact: true, className: "mt-3 text-sm" })}
        >
          {message}
        </p>
      )}
    </div>
  );
}
