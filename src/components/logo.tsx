import { LOGO_SVG, LOGO_SVG_BLUE } from "@/lib/logo-svg";

/**
 * Знак Step Up. Контуры — из векторного оригинала, присланного автором.
 *
 * Разметка вставляется строкой из lib/logo-svg.ts, чтобы контуры жили в одном
 * месте: тот же знак нужен картинке превью для мессенджеров, а туда React-
 * компонент не передать. Строка — константа в исходниках, пользовательских
 * данных в ней нет.
 *
 * Пропорции примерно 2:1, поэтому задавать надо высоту: размеры вложенного
 * svg подгоняются под обёртку, ширина считается сама.
 *
 * `auto` (по умолчанию) — знак по теме: оранжевый в тёмной, синий в светлой.
 * В разметке оба, лишний прячет CSS. Выбор в JS после гидратации показал бы
 * оранжевый на светлой странице на первом кадре — тема ставится до
 * отрисовки, и знак обязан успевать за ней.
 */
export function LogoMark({
  className = "",
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "orange" | "blue";
}) {
  if (variant === "auto") {
    return (
      <>
        {/* inline-block и light:hidden — одно свойство, но вариант в Tailwind
            идёт в стилях позже базовой утилиты и побеждает. Проверено в
            браузере, а не по памяти: на таком уже обжигались. */}
        <Mark svg={LOGO_SVG} className={`inline-block light:hidden ${className}`} />
        <Mark svg={LOGO_SVG_BLUE} className={`hidden light:inline-block ${className}`} />
      </>
    );
  }
  return (
    <Mark
      svg={variant === "blue" ? LOGO_SVG_BLUE : LOGO_SVG}
      className={`inline-block ${className}`}
    />
  );
}

function Mark({ svg, className }: { svg: string; className: string }) {
  return (
    <span
      className={`[&>svg]:h-full [&>svg]:w-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
