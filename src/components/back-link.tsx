import Link from "@/components/link";

/**
 * Возврат на экран выше.
 *
 * До 14 сентября 2026 это была ghost-кнопка со стрелкой «←» из шрифта: стрелка
 * у Manrope тонкая и стоит ниже середины строки, а кнопочный вес и отступ
 * делали навигацию похожей на действие — «деревянно», по словам автора.
 * Шеврон рисуется сам, подпись приглушённая: это путь, а не дело экрана.
 * Высота под палец остаётся.
 */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="-mt-3 -ml-1.5 inline-flex min-h-tap items-center gap-0.5 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <path d="m15 6-6 6 6 6" />
      </svg>
      {children}
    </Link>
  );
}
