import { z } from "zod";

import { isShortMapLink, parseRoutePoint } from "@/lib/weather/coords";

/**
 * Пустое поле формы приходит пустой строкой, а в базе должно стать NULL.
 * Иначе «не заполнено» и «заполнено пустотой» — два разных состояния,
 * и вёрстка начинает показывать пустые строки вместо того, чтобы скрывать блок.
 */
const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

const optionalNumber = (max: number) =>
  z.preprocess(
    (value) => (emptyToNull(value) === null ? null : Number(value)),
    z
      .number({ error: "Нужно число" })
      .nonnegative("Не может быть отрицательным")
      .max(max)
      .nullable(),
  );

export const hikeInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Слишком короткое название")
      .max(120, "Слишком длинное название"),
    routeName: optionalText(120),
    summary: optionalText(300),
    description: optionalText(5000),

    category: z.coerce
      .number()
      .int()
      .min(1, "Категория от 1 до 5")
      .max(5, "Категория от 1 до 5"),
    distanceKm: optionalNumber(500),
    elevationGainM: optionalNumber(10000),
    durationHours: optionalNumber(240),

    // Время приходит из datetime-local: «2026-09-14T06:30», местное.
    startsAtLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Укажи дату и время"),
    meetingPoint: optionalText(200),
    meetingPointUrl: z.preprocess(
      emptyToNull,
      z.url("Нужна ссылка целиком, вместе с https://").nullable(),
    ),
    registrationOpensAtLocal: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Неверная дата")
        .nullable(),
    ),
    registrationClosesAtLocal: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Неверная дата")
        .nullable(),
    ),

    // Точка маршрута для прогноза. Хранится разобранной, но проверяется
    // здесь, чтобы лидер увидел ошибку под своим полем, а не общим сообщением.
    routePoint: z.preprocess(
      emptyToNull,
      z
        .string()
        .nullable()
        .superRefine((value, ctx) => {
          if (value === null || parseRoutePoint(value) !== null) return;
          ctx.addIssue({
            code: "custom",
            // Короткую ссылку «Поделиться» узнаём отдельно: общее «не похоже
            // на координаты» тут бесполезно — лидер вставил именно то, что
            // даёт кнопка в приложении, и не догадается, чего от него хотят.
            message: isShortMapLink(value)
              ? "В короткой ссылке нет координат. Открой её, задержи палец на точке и скопируй числа сверху"
              : "Нужны координаты вида 43.12345, 76.98765",
          });
        }),
    ),
    routeAltitudeM: optionalNumber(9000),

    capacity: z.coerce
      .number()
      .int()
      .min(1, "Хотя бы одно место")
      .max(200, "Слишком много для группы"),
    openToNewcomers: z.preprocess((v) => v === "on" || v === true, z.boolean()),

    costAmount: optionalNumber(1_000_000),
    costNote: optionalText(200),
  })
  .refine(
    (data) =>
      data.registrationClosesAtLocal === null ||
      data.registrationClosesAtLocal <= data.startsAtLocal,
    {
      path: ["registrationClosesAtLocal"],
      error: "Запись не может закрываться после выхода",
    },
  )
  .refine(
    (data) =>
      data.registrationOpensAtLocal === null ||
      data.registrationClosesAtLocal === null ||
      data.registrationOpensAtLocal <= data.registrationClosesAtLocal,
    {
      path: ["registrationOpensAtLocal"],
      error: "Запись открывается позже, чем закрывается",
    },
  )
  .refine(
    (data) => data.routePoint === null || data.routeAltitudeM !== null,
    {
      path: ["routeAltitudeM"],
      // То же правило стоит констрейнтом в базе: без высоты прогноз нечем
      // подписать, а подпись с высотой — весь смысл блока.
      error: "Без высоты прогноз бесполезен — укажи её",
    },
  );

export type HikeInput = z.infer<typeof hikeInputSchema>;

/** Ошибки по полям — форма показывает их рядом с полем, а не списком сверху. */
export type FieldErrors = Partial<Record<string, string>>;

export function collectFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
