"use client";

import { useState } from "react";

import { copyText } from "@/lib/copy";

/**
 * Копирование готового текста в буфер.
 *
 * Сам механизм копирования — в `lib/copy.ts`: он же нужен строке участника
 * на экране сборки чата, а запасной путь для встроенного окна мессенджера
 * не тот код, который стоит держать в двух местах.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = "Скопировано",
  className = "",
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setFailed(false);
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <button type="button" onClick={copy} className={className}>
        {copied ? copiedLabel : label}
      </button>
      {/* Раньше здесь было «выдели текст ниже», а никакого текста на экране
          не было: кнопка стояла в строке списка походов. Совет отправлял
          лидера выделять пустоту — и ровно в том случае, ради которого
          запасной путь и писали. Теперь текст рядом с кнопкой, а
          формулировка не привязана к тому, сверху он или снизу. */}
      {failed && (
        <p role="alert" className="mt-2 text-sm text-danger">
          Браузер не дал скопировать. Выдели текст анонса и скопируй вручную.
        </p>
      )}
    </>
  );
}
