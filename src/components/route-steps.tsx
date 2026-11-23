import { parseRouteDescription } from "@/lib/hikes/route-steps";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";

/**
 * «О маршруте»: цепочка точек — схемой, всё прочее — абзацем, как было.
 *
 * Когда описание цепочка, решает lib/hikes/route-steps.ts; здесь только вид.
 * Линия и точки — цвета темы: акцентом отмечены концы маршрута, середина —
 * тихими точками, чтобы глаз шёл от старта к финишу.
 */
export async function RouteDescription({ text }: { text: string }) {
  const { steps, rest } = parseRouteDescription(text);
  // Точки — текст лидера, как написаны; переводятся только подписи схемы.
  const t = getDictionary(await getLocale()).routeSteps;

  return (
    <>
      {steps && <RouteSteps steps={steps} t={t} />}
      {rest && (
        <p className={`${steps ? "mt-4" : "mt-3"} whitespace-pre-line text-fg-muted`}>{rest}</p>
      )}
    </>
  );
}

function RouteSteps({ steps, t }: { steps: string[]; t: Dictionary["routeSteps"] }) {
  const lastIndex = steps.length - 1;

  return (
    <ol aria-label={t.label} className="mt-4">
      {steps.map((step, index) => {
        const first = index === 0;
        const last = index === lastIndex;

        return (
          <li key={index} className="flex gap-4">
            {/*
              Колонка с линией тянется на всю высоту пункта (flex stretch), и
              отрезок снизу у одной точки встык продолжается отрезком сверху
              у следующей — линия выглядит сплошной, хотя пункты отдельные.
              Центр точки — 12px, середина первой строки названия (leading-6).
            */}
            <div aria-hidden className="relative flex w-3 shrink-0 justify-center">
              {!first && <span className="absolute top-0 h-3 w-0.5 bg-line" />}
              {!last && <span className="absolute top-3 bottom-0 w-0.5 bg-line" />}
              <span
                className={
                  first
                    ? "relative mt-1.5 size-3 rounded-full border-2 border-accent-500 bg-bg"
                    : last
                      ? "relative mt-1.5 size-3 rounded-full bg-accent-500"
                      : "relative mt-2 size-2 rounded-full bg-fg-muted"
                }
              />
            </div>
            <div className={`min-w-0 ${last ? "" : "pb-4"}`}>
              <p className={`leading-6 text-fg ${first || last ? "font-semibold" : ""}`}>
                {step}
              </p>
              {(first || last) && (
                <p className="text-xs text-fg-muted">{first ? t.start : t.finish}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
