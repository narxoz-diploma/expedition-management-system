/**
 * Классы кнопок и полей — одним местом.
 *
 * Это функции, а не компоненты, потому что половина кнопок на сайте — ссылки
 * (`Link`), половина — `button` внутри формы, а поля бывают `input`, `select`
 * и `textarea`. Полиморфный компонент ради этого пришлось бы типизировать
 * сложнее, чем он того стоит: классы нужны всем, а тег каждый выбирает сам.
 *
 * До этого одни и те же строки лежали в полутора десятках файлов и успели
 * разъехаться — где-то `font-semibold`, где-то `font-medium`, где-то `text-sm`
 * без причины. Константу заводили трижды независимо (`BTN` в members-admin,
 * `PRIMARY`/`SECONDARY` в register-button, `fieldClass` слово в слово в двух
 * формах), так что компонент здесь не украшение — он трижды пытался родиться.
 */

type Variant = "primary" | "secondary" | "accent-outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  /**
   * Главное действие экрана. Ровно одно на экран: если акцентных кнопок две,
   * ни одна не главная — ради этого правила всё и затевалось.
   */
  primary:
    // Выключенная — серой, а не полупрозрачным оранжевым: 40% акцента на
    // тёмном давали коричневый, и неактивная «Подтвердить кодом» выглядела
    // кнопкой другого цвета, а не выключенной (проход по экранам, 13 сентября
    // 2026).
    "bg-accent-500 font-semibold text-on-accent hover:bg-accent-400 " +
    "disabled:bg-surface-raised disabled:text-fg-muted",
  /**
   * Заливкой без рамки. С рамкой в строке кнопок одинакового веса глаз
   * считал рамки, а не подписи, и главная кнопка переставала быть главной.
   */
  secondary: "bg-surface-raised font-semibold text-fg hover:bg-line disabled:opacity-40",
  /**
   * Яркая, но не залитая. Только «Войти» в шапке: вход — главная дорога на
   * сайт, и кнопка должна бросаться в глаза, но залитая акцентом она спорила
   * бы с главной кнопкой самой страницы (решение автора, 14 сентября 2026).
   */
  "accent-outline":
    "border border-accent-500 font-semibold text-accent-500 hover:border-accent-400 hover:text-accent-400 disabled:opacity-40",
  /** Третьестепенное: «не отменять», «назад». Не должно спорить с primary. */
  ghost: "font-medium text-fg-muted hover:text-fg disabled:opacity-40",
  /**
   * Обводкой, без заливки при наведении: полупрозрачный красный на тёмном
   * становится бурым. «Снять с похода» и «Отменить поход» были ghost-ссылками
   * и выглядели как «подробнее».
   */
  danger: "border border-danger/50 font-semibold text-danger hover:border-danger disabled:opacity-40",
};

/**
 * Нажатое состояние: фильтр включён, режим выбран.
 *
 * Отдельной строкой, а не классами поверх варианта, и это не украшение.
 * Дважды подряд подсветку дописывали сверху — сначала border-accent-500
 * поверх border-line, потом bg-accent-500/15 поверх bg-surface, — и оба раза
 * она не появлялась: обе утилиты про одно свойство, и какая победит, решает
 * порядок в стилях Tailwind, а не порядок в атрибуте. Класс стоит, эффекта
 * нет, все четыре проверки молчат. Здесь вариант заменяется целиком, и
 * спорить нечему.
 *
 * Светлой заливкой, а не оранжевой полупрозрачной, — с 14 сентября 2026.
 * Оранжевый на 15% поверх тёмного давал бурый, и выбранный вариант в анкете
 * снаряжения выглядел испачканным, а не выбранным.
 */
const SELECTED = "bg-fg font-semibold text-bg disabled:opacity-40";

// Выключенное состояние — в каждом варианте, а не здесь: у primary оно
// серое, у остальных полупрозрачное, и общий disabled:opacity в основе
// спорил бы с вариантом за то же свойство — см. комментарий к SELECTED.
const BASE =
  "inline-flex h-tap shrink-0 items-center justify-center gap-2 rounded-xl px-4 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 " +
  "disabled:cursor-not-allowed";

export function buttonClass({
  variant = "secondary",
  size = "md",
  block = false,
  selected = false,
  className = "",
}: {
  variant?: Variant;
  /** `sm` — только мельче текст. Высота остаётся 44px: это палец, а не шрифт. */
  size?: "md" | "sm";
  block?: boolean;
  /** Кнопка-переключатель во включённом состоянии. Заменяет вариант целиком. */
  selected?: boolean;
  className?: string;
} = {}): string {
  return [
    BASE,
    selected ? SELECTED : VARIANTS[variant],
    size === "sm" ? "text-sm" : "",
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Карточка — поверхность со своим содержимым: секция профиля, поход в списке,
 * участник в ростере.
 *
 * `dense` — для строк списка, где карточек подряд много и полные поля
 * растягивают список вдвое.
 */
export function cardClass({
  dense = false,
  flush = false,
  className = "",
}: { dense?: boolean; flush?: boolean; className?: string } = {}): string {
  return [
    "rounded-2xl bg-surface",
    // flush — карточка без внутреннего отступа: содержимое идёт от края до
    // края. Нужен там, где сверху лежит фотография: отступ вокруг неё
    // превращает карточку в рамку с картинкой внутри. Отступ в этом случае
    // ставит уже сама карточка своему текстовому блоку.
    flush ? "overflow-hidden" : dense ? "p-4" : "p-5",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type Tone = "warning" | "danger" | "success" | "accent";

const TONES: Record<Tone, string> = {
  // Рамка и подложка — токенами темы (*-line, *-tint в globals.css). На тёмном
  // это прежние 40% рамки и обычная поверхность: полупрозрачная заливка там
  // превращалась в бурую муть. На белом рамка плотнее и фон чуть тонирован —
  // иначе жёлтую плашку было почти не видно.
  warning: "border-warning-line bg-warning-tint",
  danger: "border-danger-line bg-danger-tint",
  success: "border-success-line bg-success-tint",
  // Не состояние, а внимание: «заявки ждут ответа». Отдельно от warning
  // намеренно — жёлтый тут читался бы как «что-то не так».
  accent: "border-accent-line bg-accent-tint",
};

/**
 * Плашка состояния.
 *
 * Была самым разъехавшимся местом в проекте: один и тот же смысл жил в трёх
 * радиусах (`md`, `lg`, `xl`) и трёх отступах (`p-3`, `p-4`, `p-5`) —
 * шестнадцать плашек пяти разных форм. Поэтому функция, а не классы руками.
 *
 * `compact` — когда плашка лежит внутри карточки или формы: рядом с полями
 * и собственными полями карточки полноразмерная выглядит тяжело.
 *
 * Содержимое внутри: заголовок `font-medium text-fg`, пояснение
 * `mt-2 text-sm text-fg-muted`, действие — кнопкой с `mt-4`.
 */
export function calloutClass({
  tone,
  compact = false,
  className = "",
}: {
  tone: Tone;
  compact?: boolean;
  className?: string;
}): string {
  return [
    "rounded-2xl border",
    TONES[tone],
    compact ? "p-4" : "p-5",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Поле ввода. Без внешних отступов — их задаёт форма: в одной поля идут через
 * `mt-2` под подписью, в другой через `mt-3` подряд, и зашитый сюда отступ
 * пришлось бы перебивать на половине вызовов.
 *
 * `min-h-tap` вместо `h-tap`, чтобы одинаково годилось для `textarea`.
 */
export function fieldClass(error?: boolean): string {
  return [
    "min-h-tap w-full rounded-xl border bg-surface px-4 py-2 text-fg",
    "placeholder:text-fg-subtle focus:outline-none",
    error ? "border-danger" : "border-line focus:border-accent-500",
  ].join(" ");
}

export type ChipTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  /** Нужно действие, но ничего не сломано: черновик ждёт публикации. */
  | "accent"
  /** Не состояние, а свойство — «Можно новичкам». Без точки. */
  | "outline";

const CHIP_DOTS: Record<ChipTone, string | null> = {
  neutral: "bg-fg-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent-500",
  outline: null,
};

/**
 * Чип статуса. Разметка — в `components/chip.tsx`; классы здесь, чтобы их
 * видел `node --test`.
 */
export function chipClass({
  tone = "neutral",
  className = "",
}: { tone?: ChipTone; className?: string } = {}): string {
  return [
    "inline-flex h-7 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold whitespace-nowrap",
    tone === "outline" ? "border border-line text-fg" : "bg-surface-raised text-fg",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Точка чипа или null, если у тона её нет. */
export function chipDotClass(tone: ChipTone): string | null {
  const color = CHIP_DOTS[tone];
  return color ? `size-1.5 shrink-0 rounded-full ${color}` : null;
}

/**
 * Плавающая кнопка — стекло, а не акцент.
 *
 * До 14 сентября 2026 плавающие «Посмотреть походы» и «К записи» были
 * залитыми оранжевыми: вторая главная кнопка поверх экрана, спорившая с
 * главными кнопками внутри страницы. Полупрозрачная с размытием она читается
 * как навигация. Текст основным цветом — на размытом фоне оранжевый текст
 * читался бы хуже; акцентом только стрелка.
 *
 * Где `backdrop-filter` не поддерживается, остаётся тёмная полупрозрачная
 * подложка — читается и так.
 */
export function floatingButtonClass(): string {
  return [
    "inline-flex h-tap shrink-0 items-center justify-center gap-2 rounded-full px-5",
    "border border-fg/15 bg-bg/70 font-semibold text-fg shadow-lg backdrop-blur-md",
    "hover:bg-bg/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500",
  ].join(" ");
}
