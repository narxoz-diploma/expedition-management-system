import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";

import { ThemeKeeper } from "@/components/theme-keeper";
import { getDictionary } from "@/lib/i18n/dictionary";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  UNREVIEWED_LOCALES,
} from "@/lib/i18n/locales";
import { getSiteUrl } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme";

// Кириллица обязательна: без subset "cyrillic" шрифт подменится системным
// прямо на проде, и обнаружится это поздно.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-unbounded",
  display: "swap",
  weight: ["600", "700"],
});

/**
 * Метаданные считаются на запрос ради metadataBase.
 *
 * Без него относительные адреса картинок в og:image остаются относительными,
 * а WhatsApp и Telegram принимают только абсолютные — превью просто не
 * появится. Адрес берётся из заголовков запроса, поэтому одинаково верен и на
 * проде, и на превью-деплоях Vercel, у которых домен каждый раз новый.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const t = getDictionary(locale).meta;

  return {
    metadataBase: new URL(await getSiteUrl()),
    title: {
      default: t.title,
      template: t.titleTemplate,
    },
    description: t.description,
    openGraph: {
      type: "website",
      locale: t.ogLocale,
      siteName: "Step Up",
    },
    // Непроверенный перевод не должен попасть в поисковую выдачу: закрыт до
    // вычитки носителем (UNREVIEWED_LOCALES в lib/i18n/locales.ts).
    ...(UNREVIEWED_LOCALES.includes(locale) && {
      robots: { index: false, follow: false },
    }),
  };
}

/**
 * Все языки известны заранее. Без этого сегмент [lang] считался бы
 * неизвестным, и под ним перестали бы кэшироваться маршруты, которые держат
 * кэш через пустой generateStaticParams, — картинка превью похода (грабли
 * «динамический сегмент без generateStaticParams» в CLAUDE.md).
 */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// themeColor здесь намеренно нет: цвет полосы браузера ставит скрипт темы
// своим тегом — почему не через viewport, в lib/theme.ts.
export const viewport: Viewport = {};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  // Несуществующий язык сюда не доходит — proxy переписывает такой адрес на
  // русский. Проверка — на адреса, которые proxy обходит стороной.
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    // suppressHydrationWarning — только на <html>: скрипт темы ставит на него
    // data-theme до гидратации, и React иначе ругался бы на расхождение с
    // серверной разметкой. Детей это не касается.
    <html
      lang={lang}
      className={`${manrope.variable} ${unbounded.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* До первой отрисовки, иначе мигнёт тёмным. Почему не на сервере —
            в lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeKeeper />
        {children}
        {/* Аналитика Vercel: без файлов cookie и без персональных данных,
            поэтому баннер согласия не нужен. */}
        <Analytics />
      </body>
    </html>
  );
}
