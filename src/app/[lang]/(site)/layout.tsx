import { HikesCta } from "@/components/hikes-cta";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { getCurrentProfile } from "@/lib/profile";

/**
 * Обычные страницы сайта — с шапкой.
 *
 * Вход живёт вне этой группы намеренно: показывать кнопку «Войти» на странице
 * входа незачем, а кнопка «Выйти» там вообще не имеет смысла.
 */
export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Только факт входа, без имени и контактов: компонент клиентский.
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);

  // Колонка на всю высоту экрана: содержимое занимает остаток сверх шапки.
  // Так высота шапки нигде не продублирована числом и может меняться, не
  // утягивая страницу в прокрутку на пару пикселей.
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
      <HikesCta signedIn={Boolean(profile)} label={getDictionary(locale).hikesCta.label} />
    </div>
  );
}
