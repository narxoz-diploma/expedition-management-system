import { chipClass, chipDotClass, type ChipTone } from "@/components/ui";

/**
 * Статус или свойство одной формой: точка цвета состояния и подпись.
 *
 * До 14 сентября 2026 один и тот же смысл жил четырьмя способами: цветной
 * строкой над карточкой («Место за тобой»), зелёной плашкой («в чате»), серым
 * словом («гость») и бурой плашкой («Можно новичкам»). По одному экрану этого
 * не видно — видно только по всем сразу, и сайт выглядел собранным из разных
 * кусков.
 *
 * Компонентом, а не одной функцией классов, потому что точка — отдельный
 * элемент, и забыть её в половине мест вызова было бы так же легко, как
 * раньше забывали одинаковые классы.
 */
export function Chip({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}) {
  const dot = chipDotClass(tone);

  return (
    <span className={chipClass({ tone, className })}>
      {dot && <span aria-hidden className={dot} />}
      {children}
    </span>
  );
}
