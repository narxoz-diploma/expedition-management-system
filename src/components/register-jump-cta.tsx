"use client";

import { useEffect, useState } from "react";

import { floatingButtonClass } from "@/components/ui";

/**
 * Плавающая кнопка «К записи» на странице похода.
 *
 * Не пытается угадать, что показать: `RegisterButton` решает между восемью
 * состояниями (`registrationCta()` в lib/hikes/registration-cta.ts) — «Войти
 * и записаться», «Ты в листе ожидания», «Запись закрыта» и так далее.
 * Копия каждого состояния здесь означала бы дублировать ту же логику и рано
 * или поздно разойтись с оригиналом. Вместо этого кнопка просто доскролливает
 * до настоящего блока — он уже знает, что там правильно нарисовать.
 *
 * Нужна, потому что блок записи стоит последним на странице, после
 * расписки, погоды, фотографий и описания маршрута — на походе с альбомом
 * до него реально далеко скроллить, и человек с медленным интернетом может
 * не долистать.
 *
 * Логика показа зеркалит `hikes-cta.tsx`, но с одним осознанным отличием:
 * там нулевой якорь — повод кнопку показать (она ведёт на статичный /hikes
 * и без якоря на странице). Здесь якорь — это блок записи, и если его нет
 * вовсе — прошедший поход, закрытая запись или человек уже записан (якорь
 * ставят только ветки, где можно действовать), — скроллить
 * некуда, и кнопка не должна появляться.
 */
export function RegisterJumpCta({
  label,
}: {
  /** Подпись на языке страницы: компонент клиентский, словарь — на сервере. */
  label: string;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [anchorVisible, setAnchorVisible] = useState(true);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      "[data-register-jump-anchor]",
    );

    // setState прямо в теле эффекта даёт каскадный повтор рендера — та же
    // причина, что и в hikes-cta.tsx. Задержка в один кадр глазом не видна.
    const frame = requestAnimationFrame(() => setTarget(el));
    if (!el) return () => cancelAnimationFrame(frame);

    const observer = new IntersectionObserver(([entry]) => {
      setAnchorVisible(entry.isIntersecting);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Якоря нет — записаться отсюда нельзя или уже записан. Рендерить
  // кнопку, которой некуда вести, хуже, чем не рендерить её вовсе.
  if (!target) return null;

  const visible = !anchorVisible;

  return (
    <div
      /* bottom считается от безопасной зоны, а не от нуля: на iOS внизу
         полоса браузера, и кнопка без этого оказывается под ней. */
      className={`fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 transition-all duration-200 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
      aria-hidden={!visible}
    >
      <button
        type="button"
        tabIndex={visible ? undefined : -1}
        onClick={() => target.scrollIntoView({ behavior: "smooth", block: "start" })}
        className={floatingButtonClass()}
      >
        {label}
        <span aria-hidden className="text-accent-500">
          ↓
        </span>
      </button>
    </div>
  );
}
