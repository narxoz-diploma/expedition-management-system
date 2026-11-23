"use client";

/**
 * Падение самого корневого layout — последняя граница ошибок.
 *
 * Отличается от `error.tsx` тем, что заменяет собой весь документ, поэтому
 * обязана рисовать `<html>` и `<body>` сама. По той же причине здесь нет ни
 * одного класса Tailwind: стили подключает корневой layout, а он в этот
 * момент не отрисовался — классы приехали бы пустыми, и человек увидел бы
 * чёрный текст на белом без единого отступа. Цвета взяты из globals.css
 * значениями; это единственное место в проекте, где так можно.
 *
 * Случай редкий до неправдоподобия, но именно поэтому его и не проверить
 * потом: если он всё же наступит, чинить будет некогда.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#0b090a",
          color: "#f7f5f5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Сайт сейчас не работает
          </h1>
          <p style={{ marginTop: "12px", color: "#aaa1a3" }}>
            Мы уже знаем об этом. Попробуй обновить страницу через несколько
            минут, а если нужно срочно — напиши лидеру в чат клуба.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              minHeight: "44px",
              padding: "0 24px",
              borderRadius: "6px",
              border: "none",
              background: "#fd5e0a",
              color: "#0b090a",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
          {error.digest && (
            <p style={{ marginTop: "24px", fontSize: "0.875rem", color: "#aaa1a3" }}>
              Код ошибки: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
