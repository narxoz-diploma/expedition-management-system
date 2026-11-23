import { ImageResponse } from "next/og";

import { getDictionary } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, isLocale, LOCALES } from "@/lib/i18n/locales";
import { LOGO_DATA_URI } from "@/lib/logo-svg";
import { loadOgFont, OG_COLORS, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

/*
 * Картинка превью главной и всех страниц без своей.
 *
 * Лежит рядом с корневым layout, под [lang], а не в корне app/: оттуда после
 * переезда страниц под [lang] она перестала действовать — страницы не
 * ссылались на неё, и превью в WhatsApp выходило без картинки (15 сентября
 * 2026, нашлось по og:* тегам на проде).
 *
 * Текст — на языке ссылки: английскую ссылку пересылают тем, кому русский
 * мешает, и русская картинка над ней говорила бы обратное.
 */

// Подпись для читалки одна на все языки: `alt` здесь — постоянная, а не
// функция от адреса. Менять на generateImageMetadata ради неё незачем — это
// поменяло бы адрес самой картинки.
export const alt = "Step Up — Narxoz University";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Все языки — заранее, при сборке, как было до переезда (картинка в корне
 * собиралась статически). Без этого динамический сегмент [lang] делал её
 * отрисовкой на каждый запрос — флаг «ƒ» в выводе сборки: Satori и загрузка
 * шрифта на каждое превью, которое мессенджеры тянут разом.
 */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

const EYEBROW = "STEP UP";

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const t = getDictionary(isLocale(lang) ? lang : DEFAULT_LOCALE).og;
  // Шрифт урезан до букв текста — казахские в нём появятся, только если
  // текст передан целиком.
  const font = await loadOgFont(`${t.homeTitle}${t.homeSubtitle}${EYEBROW}`);

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
          padding: 72,
          fontFamily: "Manrope",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_DATA_URI} alt="" width={300} height={152} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: OG_COLORS.accent,
              fontSize: 30,
              letterSpacing: 6,
            }}
          >
            {EYEBROW}
          </div>
          <div
            style={{
              color: OG_COLORS.fg,
              fontSize: 76,
              lineHeight: 1.1,
              marginTop: 16,
            }}
          >
            {t.homeTitle}
          </div>
          <div style={{ color: OG_COLORS.muted, fontSize: 34, marginTop: 20 }}>
            {t.homeSubtitle}
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
