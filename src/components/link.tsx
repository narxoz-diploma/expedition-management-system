"use client";

import NextLink from "next/link";
import { useParams } from "next/navigation";
import type { ComponentProps } from "react";

import { DEFAULT_LOCALE, isLocale, localizeHref } from "@/lib/i18n/locales";

/**
 * Link, который помнит язык: на /en/… «/hikes» ведёт на /en/hikes.
 *
 * Обёртка вместо правки каждого href: внутренних ссылок в проекте под сотню,
 * и забытая одна молча уводила бы англоязычного человека на русский. Здесь
 * забыть нельзя — все внутренние ссылки идут через этот компонент, а
 * next/link напрямую импортировать не нужно.
 *
 * Язык — из параметров маршрута, а не из адреса: useParams одинаков на
 * сервере и в браузере, и ссылка не расходится при гидратации.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const params = useParams();
  const locale = isLocale(params?.lang) ? params.lang : DEFAULT_LOCALE;

  return <NextLink href={typeof href === "string" ? localizeHref(href, locale) : href} {...props} />;
}
