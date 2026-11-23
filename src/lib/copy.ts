/**
 * Копирование в буфер обмена.
 *
 * Запасной путь через textarea нужен не для древних браузеров, а для
 * встроенного окна мессенджера: navigator.clipboard требует защищённого
 * контекста и разрешения, которых там может не быть, — а лидер копирует
 * именно оттуда, чтобы вставить обратно в чат.
 *
 * Бросает, если не вышло ни так, ни так: вызывающий сам решает, что сказать
 * человеку — на разных экранах копируется разное, и «выдели текст анонса»
 * рядом с телефоном звучит глупо.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Разрешения нет — падаем в запасной путь, а не наружу.
    }
  }
  legacyCopy(text);
}

function legacyCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  if (!ok) throw new Error("execCommand copy failed");
}
