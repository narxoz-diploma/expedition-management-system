"use client";

import { useActionState } from "react";

import { saveProfile, type ProfileFormState } from "@/app/actions/profile";
import { buttonClass, calloutClass, cardClass, fieldClass } from "@/components/ui";
import { FITNESS_LEVELS } from "@/lib/fitness";
import { submitKeepingValues } from "@/lib/form-submit";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { fill } from "@/lib/i18n/fill";
import { formatPhone } from "@/lib/phone";
import type { CurrentProfile, EmergencyContact } from "@/lib/profile";

const EMPTY: ProfileFormState = {};

/**
 * Мини-профиль: шесть полей и согласие, больше ничего.
 *
 * Каждое лишнее поле на пути к записи — потерянные люди. Факультет, курс
 * сверх обязательного, снаряжение, аватар — всё это добирается потом и
 * добровольно, а не на входе.
 */
export function ProfileForm({
  profile,
  contact,
  next,
  t,
  fitnessLabels,
}: {
  profile: CurrentProfile;
  contact: EmergencyContact | null;
  next: string;
  /** Кусок словаря пропсом: компонент клиентский, словарь целиком — на сервере. */
  t: Dictionary["profileForm"];
  fitnessLabels: Dictionary["fitnessLevels"];
}) {
  const [state, formAction, pending] = useActionState(
    saveProfile.bind(null, next),
    EMPTY,
  );

  const err = (field: string) => state.errors?.[field];

  return (
    /* Форма уже страницы: поле во всю ширину контейнера выглядит анкетой из
       налоговой, а не мини-профилем на шесть полей. Ограничивает себя сама
       форма — страница остаётся общей ширины, как шапка. См. docs/UI.md §1. */
    <form onSubmit={submitKeepingValues(formAction)} className="mt-8 flex max-w-xl flex-col gap-6">
      {state.message && (
        <p
          role="alert"
          className={calloutClass({ tone: "danger", compact: true, className: "text-sm" })}
        >
          {state.message}
        </p>
      )}

      <Field
        label={t.fullName}
        name="fullName"
        error={err("fullName")}
        hint={t.fullNameHint}
        required
      >
        <input
          id="fullName"
          name="fullName"
          required
          autoComplete="name"
          defaultValue={profile.fullName}
          className={inputClass(err("fullName"))}
        />
      </Field>

      <Field
        label={t.phone}
        name="phone"
        error={err("phone")}
        hint={t.phoneHint}
        required
      >
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="+7 701 234 56 78"
          /* С пробелами, как везде на сайте: сырой «+77012345678» в поле
             трудно сверить глазами. Разбор пробелы и так понимает. */
          defaultValue={profile.phone ? formatPhone(profile.phone) : ""}
          className={inputClass(err("phone"))}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
        <Field
          label={t.birthDate}
          name="birthDate"
          error={err("birthDate")}
          required
        >
          <input
            id="birthDate"
            name="birthDate"
            type="date"
            required
            defaultValue={profile.birthDate ?? ""}
            className={inputClass(err("birthDate"))}
          />
        </Field>

        <Field label={t.studyYear} name="studyYear" error={err("studyYear")}>
          {/* Выбор, а не поле ввода: значений всего четыре, и печатать цифру
              на телефоне дольше, чем ткнуть. */}
          <select
            id="studyYear"
            name="studyYear"
            defaultValue={profile.studyYear ?? ""}
            className={inputClass(err("studyYear"))}
          >
            <option value="">{t.studyYearNone}</option>
            {[1, 2, 3, 4].map((year) => (
              <option key={year} value={year}>
                {fill(t.studyYearOption, { n: year })}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Обязательное, поэтому выше необязательного «где уже был».
          Радио, а не выпадающий список: три варианта видны сразу, и человек
          выбирает из формулировок, а не из слова «средний». */}
      <fieldset className={cardClass({ dense: true })}>
        <legend className="float-left mb-2 w-full font-semibold">
          {t.fitness}<span className="text-fg-muted"> *</span>
        </legend>
        <p className="text-sm text-fg-muted">{t.fitnessNote}</p>
        <div className="mt-4 flex flex-col gap-2">
          {FITNESS_LEVELS.map((level) => (
            /* Свой кружок вместо системного: браузерная радиокнопка красила
               выбранное оранжевой точкой с тёмным кольцом, и на светлой
               выбранной карточке это давало три цвета в одной точке. Сама
               радиокнопка остаётся — невидимой: клавиатура, required и
               диктор работают через неё, а фокус рисуется на карточке. */
            <label
              key={level.value}
              className="group flex min-h-tap cursor-pointer items-center gap-3 rounded-xl bg-surface-raised px-4 py-3 has-checked:bg-fg has-checked:text-bg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500"
            >
              <input
                type="radio"
                name="fitnessLevel"
                value={level.value}
                required
                defaultChecked={profile.fitnessLevel === level.value}
                className="sr-only"
              />
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-fg-muted/60 group-has-checked:border-bg group-has-checked:bg-bg"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="hidden size-3 text-fg group-has-checked:block"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </span>
              {/* Подпись — на языке страницы; сам уровень хранится числом,
                  и русские короткие ярлыки для ростера лидера от этого не
                  зависят (lib/fitness.ts). */}
              <span className="text-sm">{fitnessLabels[level.value]}</span>
            </label>
          ))}
        </div>
        {err("fitnessLevel") && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {err("fitnessLevel")}
          </p>
        )}
      </fieldset>

      {/* Необязательное и последнее из «про себя»: обязательные поля стоят
          между человеком и записью на поход, и удлинять этот путь нельзя.
          Зато лидеру, к которому записался незнакомый новичок, это самая
          полезная строка анкеты — больше её взять неоткуда. */}
      <Field
        label={t.visited}
        name="visitedPlaces"
        error={err("visitedPlaces")}
        hint={t.visitedHint}
      >
        <textarea
          id="visitedPlaces"
          name="visitedPlaces"
          rows={3}
          maxLength={1000}
          defaultValue={profile.visitedPlaces ?? ""}
          placeholder={t.visitedPlaceholder}
          className={inputClass(err("visitedPlaces"))}
        />
      </Field>

      <fieldset className={cardClass({ dense: true })}>
        <legend className="float-left mb-2 w-full font-semibold">{t.emergency}</legend>
        <p className="text-sm text-fg-muted">{t.emergencyNote}</p>

        <div className="mt-4 flex flex-col gap-4">
          <Field
            label={t.emergencyName}
            name="emergencyName"
            error={err("emergencyName")}
            required
          >
            <input
              id="emergencyName"
              name="emergencyName"
              required
              placeholder={t.emergencyNamePlaceholder}
              defaultValue={contact?.fullName ?? ""}
              className={inputClass(err("emergencyName"))}
            />
          </Field>

          <Field
            label={t.emergencyPhone}
            name="emergencyPhone"
            error={err("emergencyPhone")}
            required
          >
            <input
              id="emergencyPhone"
              name="emergencyPhone"
              type="tel"
              inputMode="tel"
              required
              placeholder="+7 701 234 56 78"
              defaultValue={contact?.phone ? formatPhone(contact.phone) : ""}
              className={inputClass(err("emergencyPhone"))}
            />
          </Field>

          {/* Не «галочка ради галочки»: по этой отметке лидер в поле понимает,
              кому он звонит, а до выхода — есть ли у несовершеннолетнего
              взрослый на связи. Раньше её негде было поставить, и в составе
              группы она не показывалась никогда. */}
          <div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="emergencyIsParent"
                defaultChecked={contact?.isParent ?? false}
                className="mt-1 size-5 shrink-0 accent-accent-500"
              />
              <span className="text-sm text-fg-muted">{t.emergencyIsParent}</span>
            </label>
            {err("emergencyIsParent") && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {err("emergencyIsParent")}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="consent"
            required
            defaultChecked={Boolean(profile.consentAt)}
            className="mt-1 size-5 shrink-0 accent-accent-500"
          />
          {/* Согласие описывает то, что сайт делает на самом деле, — иначе
              это не согласие. До 19 августа 2026 в нём не было ни срока
              хранения, ни слова о том, что данные можно удалить, а удалить
              их было нельзя вовсе. */}
          <span className="text-sm">{t.consent}</span>
        </label>
        {err("consent") && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {err("consent")}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass({ variant: "primary", block: true })}
      >
        {pending ? t.saving : t.save}
      </button>
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
