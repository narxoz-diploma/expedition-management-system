"use client";

import { useActionState } from "react";

import { saveHike, type HikeFormState } from "@/app/actions/hikes";
import { buttonClass, calloutClass, cardClass, fieldClass } from "@/components/ui";
import { submitKeepingValues } from "@/lib/form-submit";
import { CATEGORY_LABELS } from "@/lib/hikes/format";
import type { Hike } from "@/lib/hikes/types";
import { formatRoutePoint } from "@/lib/weather/coords";

const EMPTY: HikeFormState = {};

export function HikeForm({
  hike,
  startsAtLocal,
  registrationOpensAtLocal,
  registrationClosesAtLocal,
  meetingPoint,
  meetingPointUrl,
}: {
  hike: Hike | null;
  startsAtLocal: string;
  registrationOpensAtLocal: string;
  registrationClosesAtLocal: string;
  /**
   * Отдельными полями, а не из hike: этих колонок в нём больше нет — права
   * на них у клиента отобраны, и адрес приезжает своим запросом.
   */
  meetingPoint: string;
  meetingPointUrl: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveHike.bind(null, hike?.id ?? null),
    EMPTY,
  );

  const err = (field: string) => state.errors?.[field];

  return (
    /* Форма уже страницы — см. docs/UI.md §1. */
    <form onSubmit={submitKeepingValues(formAction)} className="mt-8 flex max-w-xl flex-col gap-10">
      {state.message && (
        <p
          role="alert"
          className={calloutClass({ tone: "danger", compact: true, className: "text-sm" })}
        >
          {state.message}
        </p>
      )}

      {/* Смысловыми блоками, а не семнадцатью полями одной колонкой: форма
          больше читалась, чем заполнялась (проход по экранам, 13 сентября
          2026). «Открыт для новичков» — в первом блоке, рядом с категорией:
          это решение о том, кто может пойти, а не приписка в конце формы. */}
      <FormSection title="Что за поход">
        <Field label="Название" name="title" error={err("title")} required>
          <input
            id="title"
            name="title"
            required
            defaultValue={hike?.title ?? ""}
            placeholder="Кок Жайляу"
            className={inputClass(err("title"))}
          />
        </Field>

        <Field
          label="Маршрут"
          name="routeName"
          error={err("routeName")}
          hint="Если отличается от названия. Показывается крупно на карточке."
        >
          <input
            id="routeName"
            name="routeName"
            defaultValue={hike?.routeName ?? ""}
            className={inputClass(err("routeName"))}
          />
        </Field>

        <Field
          label="Коротко о походе"
          name="summary"
          error={err("summary")}
          hint="Одна-две фразы. Их видно в описании ссылки, когда её кидают в чат."
        >
          <textarea
            id="summary"
            name="summary"
            rows={2}
            defaultValue={hike?.summary ?? ""}
            className={inputClass(err("summary"))}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
          <Field label="Категория" name="category" error={err("category")} required>
            <select
              id="category"
              name="category"
              defaultValue={hike?.category ?? 1}
              className={inputClass(err("category"))}
            >
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <option key={n} value={n}>
                  {n} — {CATEGORY_LABELS[n]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Мест"
            name="capacity"
            error={err("capacity")}
            hint="Для участников. Лидеры идут сверх этого числа."
            required
          >
            <input
              id="capacity"
              name="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              required
              defaultValue={hike?.capacity ?? 25}
              className={inputClass(err("capacity"))}
            />
          </Field>
        </div>

        <label className={cardClass({ dense: true, className: "flex items-start gap-3" })}>
          <input
            type="checkbox"
            name="openToNewcomers"
            defaultChecked={hike?.openToNewcomers ?? false}
            className="mt-1 size-5 accent-[var(--color-accent-500)]"
          />
          <span>
            <span className="font-medium text-fg">Открыт для новичков</span>
            <span className="mt-1 block text-sm text-fg-muted">
              Без этой галочки записаться смогут только подтверждённые участники
              клуба. Для первого похода новичка она обязательна.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Км" name="distanceKm" error={err("distanceKm")}>
            <input
              id="distanceKm"
              name="distanceKm"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              defaultValue={hike?.distanceKm ?? ""}
              className={inputClass(err("distanceKm"))}
            />
          </Field>

          <Field label="Набор, м" name="elevationGainM" error={err("elevationGainM")}>
            <input
              id="elevationGainM"
              name="elevationGainM"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={hike?.elevationGainM ?? ""}
              className={inputClass(err("elevationGainM"))}
            />
          </Field>

          <Field label="Часов" name="durationHours" error={err("durationHours")}>
            <input
              id="durationHours"
              name="durationHours"
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              defaultValue={hike?.durationHours ?? ""}
              className={inputClass(err("durationHours"))}
            />
          </Field>
        </div>

        <Field
          label="Описание маршрута"
          name="description"
          error={err("description")}
          hint="Точки маршрута через тире — «Медеу – Шымбулак – Пик» — на странице станут схемой. Пояснения — отдельным абзацем ниже."
        >
          <textarea
            id="description"
            name="description"
            rows={6}
            defaultValue={hike?.description ?? ""}
            className={inputClass(err("description"))}
          />
        </Field>

      </FormSection>

      <FormSection title="Когда и где">
        <Field
          label="Выход"
          name="startsAtLocal"
          error={err("startsAtLocal")}
          hint="Время местное, алматинское."
          required
        >
          <input
            id="startsAtLocal"
            name="startsAtLocal"
            type="datetime-local"
            required
            defaultValue={startsAtLocal}
            className={inputClass(err("startsAtLocal"))}
          />
        </Field>

        <Field
          label="Точка сбора"
          name="meetingPoint"
          error={err("meetingPoint")}
          hint="Видна только записавшимся — на карточке похода вместо адреса стоит время выхода."
        >
          <input
            id="meetingPoint"
            name="meetingPoint"
            defaultValue={meetingPoint}
            placeholder="у Атакента"
            className={inputClass(err("meetingPoint"))}
          />
        </Field>

        <Field
          label="Ссылка на карту"
          name="meetingPointUrl"
          error={err("meetingPointUrl")}
          hint="2ГИС или Google Maps, целиком вместе с https://"
        >
          <input
            id="meetingPointUrl"
            name="meetingPointUrl"
            type="url"
            inputMode="url"
            defaultValue={meetingPointUrl}
            className={inputClass(err("meetingPointUrl"))}
          />
        </Field>

      </FormSection>

      <FormSection title="Запись">
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
          <Field
            label="Запись с"
            hint="Пусто — сразу после публикации."
            name="registrationOpensAtLocal"
            error={err("registrationOpensAtLocal")}
          >
            <input
              id="registrationOpensAtLocal"
              name="registrationOpensAtLocal"
              type="datetime-local"
              defaultValue={registrationOpensAtLocal}
              className={inputClass(err("registrationOpensAtLocal"))}
            />
          </Field>

          <Field
            label="Запись до"
            hint="Пусто — до самого выхода."
            name="registrationClosesAtLocal"
            error={err("registrationClosesAtLocal")}
          >
            <input
              id="registrationClosesAtLocal"
              name="registrationClosesAtLocal"
              type="datetime-local"
              defaultValue={registrationClosesAtLocal}
              className={inputClass(err("registrationClosesAtLocal"))}
            />
          </Field>
        </div>

      </FormSection>

      <FormSection
        title="Погода на маршруте"
        hint="Необязательно. Без координат прогноза на странице похода не будет."
      >
        {/* Точка маршрута, а не сбора: сбор в городе, на 800 м, и прогноз по
            нему покажет городскую погоду вместо горной. */}
        <Field
          label="Координаты маршрута"
          name="routePoint"
          error={err("routePoint")}
          hint="Для прогноза погоды. На телефоне задержи палец на точке в Google Maps и скопируй числа. На компьютере — правой кнопкой по карте: координаты стоят первой строкой в меню, нажатие копирует их."
        >
          <input
            id="routePoint"
            name="routePoint"
            inputMode="decimal"
            defaultValue={
              hike?.routeLat !== null && hike?.routeLat !== undefined && hike.routeLon !== null
                ? formatRoutePoint({ lat: hike.routeLat, lon: hike.routeLon })
                : ""
            }
            placeholder="43.12345, 76.98765"
            className={inputClass(err("routePoint"))}
          />
        </Field>

        <Field
          label="Высота маршрута, м"
          name="routeAltitudeM"
          error={err("routeAltitudeM")}
          hint="Самая высокая точка, куда идём. Из набора её не вывести, а без неё прогноз бесполезен."
        >
          <input
            id="routeAltitudeM"
            name="routeAltitudeM"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={hike?.routeAltitudeM ?? ""}
            placeholder="2800"
            className={inputClass(err("routeAltitudeM"))}
          />
        </Field>

      </FormSection>

      <FormSection title="Расходы">
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
          <Field label="Расходы, ₸" name="costAmount" error={err("costAmount")}>
            <input
              id="costAmount"
              name="costAmount"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={hike?.costAmount ?? ""}
              className={inputClass(err("costAmount"))}
            />
          </Field>

          <Field label="За что" name="costNote" error={err("costNote")}>
            <input
              id="costNote"
              name="costNote"
              defaultValue={hike?.costNote ?? ""}
              placeholder="вход в парк и такси"
              className={inputClass(err("costNote"))}
            />
          </Field>
        </div>

      </FormSection>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass({ variant: "primary", block: true })}
      >
        {pending ? "Сохраняем…" : hike ? "Сохранить" : "Создать черновик"}
      </button>

      {!hike && (
        <p className="text-sm text-fg-muted">
          Поход создаётся черновиком. Участники увидят его только после
          публикации — до этого можно спокойно править.
        </p>
      )}
    </form>
  );
}

/** Отступ здесь, а не в fieldClass: поле всегда идёт под своей подписью. */
function inputClass(error?: string): string {
  return `mt-2 ${fieldClass(Boolean(error))}`;
}

function Field({
  label,
  name,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && <span className="text-fg-muted"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Блок формы: заголовок, необязательная строка пояснения и поля. */
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
