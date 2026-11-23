"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeWaiverForm, setWaiverForm } from "@/app/actions/waivers";
import { buttonClass, calloutClass, cardClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  WAIVER_FORMS_BUCKET,
  WAIVER_KINDS,
  WAIVER_LABELS,
  waiverFileProblem,
  waiverPath,
  type WaiverKind,
} from "@/lib/hikes/waiver";
import type { WaiverForms } from "@/lib/waiver-forms";

/**
 * Бланки расписки: два файла на весь клуб.
 *
 * Файл идёт из браузера прямо в Storage, минуя server action, — по той же
 * причине, что и снимки: тело server action на Vercel ограничено, а гнать
 * документ дважды незачем. Строку в waiver_forms пишет сервер.
 */
export function WaiverFormsEditor({ forms }: { forms: WaiverForms }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<WaiverKind | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPick(
    kind: WaiverKind,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    // Сбрасываем поле сразу: иначе повторный выбор того же файла не даст
    // события — значение не изменилось.
    event.target.value = "";
    if (!file) return;

    const problem = waiverFileProblem(file);
    if (problem) {
      setMessage(problem);
      return;
    }

    setMessage(null);
    setUploading(kind);
    try {
      const path = waiverPath(kind, crypto.randomUUID(), file.name);
      const { error } = await createClient()
        .storage.from(WAIVER_FORMS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;

      const result = await setWaiverForm(kind, path);
      if (result.message) {
        setMessage(result.message);
        return;
      }
      router.refresh();
    } catch (error) {
      console.error("Не удалось загрузить бланк расписки", error);
      setMessage("Не удалось загрузить файл. Попробуй ещё раз");
    } finally {
      setUploading(null);
    }
  }

  function remove(kind: WaiverKind) {
    startTransition(async () => {
      const result = await removeWaiverForm(kind);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  const busy = uploading !== null || pending;

  return (
    <section className="mt-8">
      {message && (
        <p
          role="alert"
          className={calloutClass({
            tone: "danger",
            compact: true,
            className: "mb-4 text-sm",
          })}
        >
          {message}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {WAIVER_KINDS.map((kind) => (
          <li key={kind} className={cardClass({ dense: true })}>
            <p className="font-medium text-fg">{WAIVER_LABELS[kind]}</p>

            {forms[kind] ? (
              /* Человеческое имя и «Открыть», а не служебное
                 «adult-6a10c83b-….docx», которое нельзя было проверить. */
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="mr-auto text-sm text-fg-muted">
                  Загружен, {extensionOf(forms[kind])}
                </span>
                <a
                  href={`/admin/waivers/${kind}`}
                  data-no-progress
                  className={buttonClass({ size: "sm" })}
                >
                  Открыть
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(kind)}
                  className={buttonClass({ variant: "danger", size: "sm" })}
                >
                  Убрать
                </button>
              </div>
            ) : (
              /* Не «этот бланк не покажется», как было у похода: расписка
                 нужна всегда, и участник увидит требование в любом случае.
                 Не увидит он только кнопки скачивания — и придёт без бумаги,
                 а на сборе его развернут. */
              <p className="mt-2 text-sm text-warning">
                Не загружен — скачать участникам нечего.
              </p>
            )}

            {/* Своя подпись вместо системного поля: браузер пишет его на языке
                системы — «Choose File / No file chosen». Подпись оборачивает
                скрытое поле, поэтому нажатие по ней открывает выбор файла. */}
            <label
              className={buttonClass({
                size: "sm",
                className: "mt-3 cursor-pointer has-disabled:pointer-events-none has-disabled:opacity-60",
              })}
            >
              {uploading === kind ? "Загружаем…" : forms[kind] ? "Заменить файл" : "Выбрать файл"}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                disabled={busy}
                onChange={(event) => onPick(kind, event)}
                className="sr-only"
              />
            </label>

            {uploading === kind && (
              <p className="mt-2 text-sm text-fg-muted" aria-live="polite">
                Загружаем…
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Формат загруженного файла словами — «файл Word», «PDF».
 *
 * Не имя из бакета: там «adult-6a10c83b-….docx», случайная часть лидеру ничего
 * не говорит, а исходное имя при загрузке не сохраняется. Что именно лежит,
 * проверяется кнопкой «Открыть».
 */
function extensionOf(path: string | null): string {
  if (!path) return "";
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "doc" || ext === "docx") return "файл Word";
  return ext;
}
