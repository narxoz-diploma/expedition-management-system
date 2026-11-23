// Относительные импорты, а не алиас @/: этот файл проверяется node --test
// (см. maintenance.test.ts), а node его не резолвит — см. список граблей в
// CLAUDE.md. logo-svg.ts и og.ts сами без импортов приложения, так что
// требованию «чистая логика без импортов приложения» это не противоречит.
import { LOGO_DATA_URI } from "./logo-svg.ts";
import { OG_COLORS } from "./og.ts";

export const MAINTENANCE_BYPASS_COOKIE = "su_maintenance_bypass";

/**
 * Шестерёнка для страницы техработ — нарисована сама, восемь зубцов через
 * `rotate()`, а не взята из готового набора иконок: лишняя зависимость ради
 * одного глифа того не стоит.
 */
const GEAR_SVG = `<svg class="gear" width="40" height="40" viewBox="0 0 40 40" fill="${OG_COLORS.accent}" aria-hidden="true">
  <g transform="translate(20,20)">
    ${Array.from(
      { length: 8 },
      (_, i) => `<rect x="-2.5" y="-16" width="5" height="7" transform="rotate(${i * 45})" />`,
    ).join("\n    ")}
    <circle r="11" />
    <circle r="4.5" fill="${OG_COLORS.bg}" />
  </g>
</svg>`;

/**
 * HTML страницы «идут технические работы».
 *
 * Не через App Router: рубильник обязан работать, даже если сама причина
 * работ — база не отвечает, а root layout при рендере страницы обращается к
 * заголовкам запроса и может потянуть за собой то, что сейчас как раз лежит.
 * Поэтому это готовая строка, которую proxy.ts отдаёт напрямую, в объезд
 * всего Next.js рендеринга.
 *
 * Шрифты клуба (Unbounded, Manrope) подключены через Google Fonts, а не
 * системным по умолчанию, — иначе страница выглядит ничьей, не Step Up.
 * Подключение неблокирующее (media="print" → "all" после загрузки, плюс
 * <noscript> запасным путём): страница обязана не зависеть от сети, а
 * обычный <link rel="stylesheet"> держит первую отрисовку до ответа Google
 * или таймаута — если тот тоже недоступен, текст остаётся читаемым в
 * системном шрифте вместо пустого экрана.
 */
export const MAINTENANCE_HTML = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Технические работы — Step Up</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&family=Unbounded:wght@700&display=swap"
      media="print"
      onload="this.media='all'"
    />
    <noscript>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&family=Unbounded:wght@700&display=swap"
      />
    </noscript>
    <style>
      body {
        margin: 0;
        /* Без border-box паддинг добавляется поверх 100vh, а не внутрь —
           страница выше вьюпорта, появляется скролл, а центр съезжает вниз
           на величину верхнего паддинга. */
        box-sizing: border-box;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${OG_COLORS.bg};
        color: ${OG_COLORS.fg};
        font-family: "Manrope", system-ui, sans-serif;
        text-align: center;
        padding: 24px;
      }
      img { margin: 0 auto; }
      /* Подписи «STEP UP» под знаком больше нет: знак и так со словами, и
         капс-подпись повторяла его вторым голосом (14 сентября 2026). */
      .gear {
        margin-top: 36px;
        animation: spin 8s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .gear { animation: none; }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      h1 {
        margin: 16px 0 0;
        font-family: "Unbounded", "Manrope", system-ui, sans-serif;
        font-size: clamp(28px, 5vw, 40px);
      }
      p.hint { color: ${OG_COLORS.muted}; margin-top: 12px; }
    </style>
  </head>
  <body>
    <div>
      <img src="${LOGO_DATA_URI}" alt="Step Up" width="180" height="91" />
      ${GEAR_SVG}
      <h1>Технические работы</h1>
      <p class="hint">Сайт скоро вернётся. Загляни чуть позже.</p>
    </div>
  </body>
</html>`;

export type MaintenanceDecision =
  | { action: "pass" }
  | { action: "block" }
  | { action: "grant-bypass"; token: string };

/**
 * Решение рубильника технических работ — без Next.js и без сети, чтобы
 * проверяться тестом напрямую.
 *
 * Рубильник опциональный: без `MAINTENANCE_MODE=true` ничего не меняется.
 * Без `MAINTENANCE_BYPASS_TOKEN` включённый режим блокирует вообще всех,
 * включая себя, — это осознанный выбор в пользу безопасного отказа, а не
 * баг: забыл завести токен вместе с флагом — получил рубильник, который
 * нельзя обойти, а не который можно обойти без пароля.
 *
 * @param mode Значение `MAINTENANCE_MODE`.
 * @param token Значение `MAINTENANCE_BYPASS_TOKEN`.
 * @param cookieValue Кука `su_maintenance_bypass` из запроса, если есть.
 * @param queryToken Параметр `?bypass=` из адреса, если есть.
 */
export function decideMaintenance(
  mode: string | undefined,
  token: string | undefined,
  cookieValue: string | undefined,
  queryToken: string | null,
): MaintenanceDecision {
  if (mode !== "true") {
    return { action: "pass" };
  }

  if (token && cookieValue === token) {
    return { action: "pass" };
  }

  if (token && queryToken === token) {
    return { action: "grant-bypass", token };
  }

  return { action: "block" };
}
