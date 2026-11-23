import { ImageResponse } from "next/og";

import {
  formatDateWithWeekday,
  formatInteger,
  formatNumber,
  formatTime,
  pluralize,
} from "@/lib/hikes/format";
import { getPublicHikeBySlug } from "@/lib/hikes/queries";
import { spotsLeft } from "@/lib/hikes/types";
import { fill, getDictionary } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";
import { LOGO_DATA_URI } from "@/lib/logo-svg";
import { loadOgFont, OG_COLORS, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

// Постоянная, а не функция от адреса — одна на все языки, как у главной.
export const alt = "Step Up";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Десять минут — чтобы одна ссылка не превратилась в сотню отрисовок.
 *
 * Без этого каждый запрос картинки — поход в базу плюс сборка Satori, а
 * приходят за ней разом: лидер кидает ссылку в группу, и превью тянут все
 * клиенты сразу. Мессенджеры кэшируют его и у себя, так что чаще всего
 * второго запроса не будет вовсе, — но полагаться на чужой кэш там, где свой
 * стоит одну строку, незачем.
 *
 * Десять минут, а не час: на картинке стоит счётчик мест, и он единственное,
 * что тут стареет по-настоящему.
 */
export const revalidate = 600;

/**
 * Пустой список — не заглушка, а способ включить кэш.
 *
 * Динамический сегмент без generateStaticParams Next не кэширует вовсе: он не
 * попадает в prerender-manifest.json, и выставленный выше revalidate молча ни
 * на что не влияет. Пустой список говорит «заранее не собираем ничего, но
 * собранное на лету держим по revalidate» — и в базу на сборке не ходит, что
 * важно: проект должен собираться и с выдуманными ключами.
 */
export function generateStaticParams() {
  return [];
}

/**
 * Превью похода для мессенджеров.
 *
 * Ровно то, что человек видит, не открывая ссылку: куда, когда, насколько
 * сложно и есть ли места. Лидер кидает ссылку в группу на сто двадцать
 * человек — эта картинка и есть анонс для тех, кто не станет читать текст.
 *
 * На языке ссылки. Название маршрута — как написал лидер: тексты походов не
 * переводятся.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const t = dict.og;

  // Ошибку глушим здесь, а не в запросе: превью не должно ломать ссылку.
  // Краулер мессенджера приходит один раз и ненадолго; не получив картинку,
  // он покажет голый адрес в чате, и переслать поход станет нечем. Лучше
  // карточка «поход не найден», чем пустота, — даже если на самом деле это
  // сбой базы, а не отсутствие похода.
  const hike = await getPublicHikeBySlug(slug).catch((e) => {
    console.error("Не удалось получить поход для картинки превью", e);
    return null;
  });

  const title = hike ? (hike.routeName ?? hike.title) : t.hikeNotFound;
  const date = hike ? formatDateWithWeekday(hike.startsAt, false, locale) : "";
  const time = hike ? formatTime(hike.startsAt, locale) : "";

  const facts: string[] = [];
  if (hike) {
    facts.push(fill(t.category, { n: hike.category, label: dict.categories[hike.category] }));
    if (hike.distanceKm !== null) {
      facts.push(fill(dict.hikeCard.km, { n: formatNumber(hike.distanceKm, locale) }));
    }
    if (hike.elevationGainM !== null) {
      facts.push(fill(dict.hikeCard.gain, { n: formatInteger(hike.elevationGainM, locale) }));
    }
  }

  const left = hike ? spotsLeft(hike) : 0;
  const spots = !hike
    ? ""
    : left > 0
      ? fill(t.spotsLeft, { left: pluralize(left, dict.spots.capacity, locale), capacity: hike.capacity })
      : dict.spots.full;

  const newcomers = hike?.openToNewcomers ? dict.hikeCard.newcomers : "";

  const font = await loadOgFont(
    `${title}${date}${time}${facts.join("")}${spots}${newcomers}STEP UP`,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: OG_COLORS.bg,
          padding: 64,
          fontFamily: "Manrope",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URI} alt="" width={188} height={95} />

          {newcomers && (
            <div
              style={{
                display: "flex",
                background: OG_COLORS.accent,
                color: OG_COLORS.bg,
                fontSize: 28,
                padding: "10px 24px",
                borderRadius: 999,
              }}
            >
              {newcomers}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Одной строкой, а не двумя кусками: Satori требует явный display
              у любого div больше чем с одним ребёнком, иначе роняет всю
              картинку целиком. */}
          <div style={{ color: OG_COLORS.accent, fontSize: 34 }}>
            {time ? fill(t.dateLine, { date, time }) : date}
          </div>

          <div
            style={{
              color: OG_COLORS.fg,
              fontSize: title.length > 24 ? 68 : 86,
              lineHeight: 1.1,
              marginTop: 14,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              color: OG_COLORS.muted,
              fontSize: 32,
              marginTop: 20,
            }}
          >
            {facts.join("  ·  ")}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${OG_COLORS.line}`,
            paddingTop: 28,
          }}
        >
          <div style={{ color: OG_COLORS.fg, fontSize: 34 }}>{spots}</div>
          <div style={{ color: OG_COLORS.muted, fontSize: 28, letterSpacing: 4 }}>
            STEP UP
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Manrope", data: font, weight: 700, style: "normal" }],
    },
  );
}
