"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";

import { pathWithoutLocale } from "@/lib/i18n/locales";

/**
 * Полоса разделов управления.
 *
 * Клиентская ради одного: подсветить раздел, в котором человек находится.
 * До 14 сентября 2026 «Управление» было жирным и белым всегда, на любом
 * экране, и по полосе нельзя было понять, где ты.
 *
 * «Управление» — только админу. Лидеру там нечего делать: его работа —
 * походы, а сводка с плитками вела туда же лишним касанием (решение автора,
 * 14 сентября 2026). Лидера, открывшего /admin, страница уводит в походы.
 */
export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  // Без приставки языка: экраны лидера рендерятся внутри /ru/admin, а в
  // браузере адрес /admin. Сравнивая как есть, подсветка раздела на сервере
  // и в браузере расходилась бы при гидратации.
  const pathname = pathWithoutLocale(usePathname());

  const items = [
    ...(isAdmin ? [{ href: "/admin", label: "Управление", exact: true }] : []),
    { href: "/admin/hikes", label: "Походы", exact: false },
    { href: "/admin/members", label: "Участники", exact: false },
  ];

  return (
    <nav
      aria-label="Разделы управления"
      className="mx-auto flex max-w-3xl items-center gap-5 px-6 text-sm"
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-tap items-center border-b-2 ${
              active
                ? "border-accent-500 font-semibold text-fg"
                : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <span className="ml-auto text-fg-muted">{isAdmin ? "админ" : "лидер"}</span>
    </nav>
  );
}
