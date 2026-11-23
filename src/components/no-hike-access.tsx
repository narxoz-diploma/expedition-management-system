import Link from "@/components/link";

import { buttonClass, calloutClass } from "@/components/ui";

/**
 * «Это не твой поход» вместо молчаливого редиректа.
 *
 * Раньше лидер, не входящий в состав чужого похода, нажимал «Править» и просто
 * оказывался обратно в списке — без единого слова о том, что произошло.
 * Догадаться, что дело в правах, а не в поломке, было неоткуда.
 *
 * Прятать кнопку вместо этого не годится: скрытая кнопка оставляет человека в
 * тех же догадках, просто тише. Лучше сказать, кто ведёт поход, — тогда видно
 * и что делать дальше: написать этому человеку.
 */
export function NoHikeAccess({
  what,
  leaderNames,
}: {
  /** Что именно недоступно: «править этот поход», «смотреть группу». */
  what: string;
  leaderNames: string[];
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Это не твой поход</h1>

      <div className={calloutClass({ tone: "warning", className: "mt-6" })}>
        <p className="font-medium text-fg">Нельзя {what}</p>
        <p className="mt-2 text-fg-muted">
          {leaderNames.length > 0
            ? `Поход ведёт ${leaderNames.join(", ")}. Права есть у ${
                leaderNames.length > 1 ? "них" : "него"
              } и у админа — попроси добавить тебя в состав, если идёшь.`
            : "Права есть у того, кто создал поход, и у админа."}
        </p>
        <Link href="/admin/hikes" className={buttonClass({ className: "mt-4" })}>
          Ко всем походам
        </Link>
      </div>
    </main>
  );
}
