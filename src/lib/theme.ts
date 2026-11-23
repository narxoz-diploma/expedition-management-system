/**
 * Тема сайта: «как в системе», светлая или тёмная.
 *
 * Выбор хранится в браузере, а не в куке и не в профиле. Главная кэшируется
 * одним ответом на всех гостей и куки не читает (см. CLAUDE.md, «кэшируемое
 * не читает куки»), поэтому сервер тему выбрать не может в принципе. Тему
 * ставит скрипт в <head> — до первой отрисовки, иначе у человека со светлой
 * системой на каждом открытии мелькал бы тёмный экран.
 *
 * Модуль без импортов приложения: его скрипт прогоняется в node --test.
 */

export const THEME_STORAGE_KEY = "theme";

export type ThemeChoice = "system" | "light" | "dark";

/** Цвет полосы браузера — фон страницы в каждой теме, ink-950 и ink-50. */
export const THEME_COLORS = { dark: "#0b090a", light: "#f7f5f5" } as const;

/** Событие, которым меню узнаёт о смене выбора в этой же вкладке. */
const THEME_EVENT = "stepup-theme";

/*
 * Скрипт до отрисовки. Строкой и на ES5: он вставляется в <head> как есть,
 * мимо сборщика.
 *
 * Тёмная — это отсутствие атрибута, а не data-theme="dark": тёмные значения
 * лежат на :root, и так страница остаётся тёмной и там, где скрипт не
 * выполнился.
 *
 * localStorage в try: в приватном режиме части браузеров он бросает, и
 * упавший скрипт оставил бы сайт без темы вовсе, а не «как в системе».
 *
 * Цвет полосы браузера — свой единственный тег, созданный здесь же. Сначала
 * он шёл через viewport.themeColor с парой тегов по media, а скрипт их
 * переставлял: Next дописал третий уже после DOMContentLoaded — метаданные
 * приходят потоком, — и его скрипт не видел. При теме, выбранной против
 * системной, такой тег показал бы не тот цвет. Свой тег спорить не с кем.
 */
export const THEME_SCRIPT = `(function(){
var KEY=${JSON.stringify(THEME_STORAGE_KEY)};
var COLORS=${JSON.stringify(THEME_COLORS)};
var mq=window.matchMedia("(prefers-color-scheme: light)");
function stored(){try{var v=window.localStorage.getItem(KEY);return v==="light"||v==="dark"?v:null}catch(e){return null}}
function apply(){
var t=stored()||(mq.matches?"light":"dark");
var root=document.documentElement;
if(t==="light"){root.setAttribute("data-theme","light")}else{root.removeAttribute("data-theme")}
var meta=document.getElementById("stepup-theme-color");
if(!meta){meta=document.createElement("meta");meta.setAttribute("name","theme-color");meta.id="stepup-theme-color";document.head.appendChild(meta)}
meta.setAttribute("content",COLORS[t]);
}
apply();
if(mq.addEventListener){mq.addEventListener("change",apply)}
window.__stepUpTheme={apply:apply};
})();`;

type ThemeWindow = Window & { __stepUpTheme?: { apply: () => void } };

export function readThemeChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Не сохранилось — тема всё равно сменится до перезагрузки, ниже.
  }
  // Применяет тот же код, что и до отрисовки: правило выбора живёт в одном
  // месте, и меню не может разойтись со скриптом.
  (window as ThemeWindow).__stepUpTheme?.apply();
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Подписка для useSyncExternalStore: своя вкладка и соседние. */
export function subscribeThemeChoice(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
