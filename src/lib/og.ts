/**
 * Общее для картинок превью (og:image).
 *
 * Превью — это то, что видят все сто двадцать человек, когда лидер кидает
 * ссылку в группу. Картинка генерируется, а не загружается руками: иначе она
 * требовала бы от лидера действия при каждом походе, а по продуктовым
 * принципам такие функции не окупаются.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export const OG_COLORS = {
  bg: "#0b090a",
  surface: "#131011",
  fg: "#f7f5f5",
  muted: "#aaa1a3",
  accent: "#fd5e0a",
  line: "#2a2426",
};

/**
 * Шрифт для картинки.
 *
 * Satori понимает ttf, otf и woff, но не woff2 — а Google отдаёт woff2 всем,
 * кто представился современным браузером. Поэтому запрос идёт БЕЗ заголовка
 * User-Agent: только так возвращается truetype. Это проверено запросом, а не
 * взято из документации.
 *
 * Параметр text= отдаёт шрифт, урезанный до нужных букв: вместо сотен
 * килобайт — единицы, и картинка собирается быстрее.
 */
export async function loadOgFont(
  text: string,
  weight: 400 | 700 = 700,
): Promise<ArrayBuffer> {
  const url =
    `https://fonts.googleapis.com/css2?family=Manrope:wght@${weight}` +
    `&text=${encodeURIComponent(text)}`;

  const css = await withRetry(async () => {
    const response = await fetch(url, {
      // Раз в сутки: подмножество зависит от текста, а тексты у походов разные.
      next: { revalidate: 86400 },
    });
    if (!response.ok) {
      throw new Error(`Google не отдал css со шрифтом: ${response.status}`);
    }
    return response.text();
  });

  const fontUrl = css.match(
    /src:\s*url\((https:[^)]+)\)\s*format\('truetype'\)/,
  )?.[1];

  if (!fontUrl) {
    throw new Error("Google вернул шрифт в неожиданном формате");
  }

  return withRetry(async () => {
    const response = await fetch(fontUrl, { next: { revalidate: 86400 } });
    if (!response.ok) {
      throw new Error(`Google не отдал файл шрифта: ${response.status}`);
    }

    const font = await response.arrayBuffer();
    assertLooksLikeFont(font);
    return font;
  });
}

/**
 * Проверка, что приехал шрифт, а не страница.
 *
 * Сборка на Vercel упала с «Unsupported OpenType signature <htm»: Google
 * ответил билдеру HTML-страницей (отказ, а не файл), код честно отдал её
 * байты дальше, и разбираться пришлось по сообщению Satori. Ответ без этой
 * проверки означает, что любой сбой у чужого сервиса приходит к нам в самом
 * непонятном виде, какой возможен.
 *
 * Первые четыре байта у sfnt-шрифта фиксированы: 0x00010000 у truetype,
 * `true` у старого Apple-варианта, `OTTO` у CFF, `wOFF` у woff.
 */
function assertLooksLikeFont(font: ArrayBuffer): void {
  const head = new Uint8Array(font.slice(0, 4));
  const signature = Array.from(head, (b) => b.toString(16).padStart(2, "0")).join("");
  const known = ["00010000", "74727565", "4f54544f", "774f4646"];

  if (!known.includes(signature)) {
    const asText = new TextDecoder().decode(head);
    throw new Error(
      `Вместо шрифта пришло что-то другое (первые байты: ${asText.trim() || signature})`,
    );
  }
}

/**
 * Один повтор на сетевой запрос.
 *
 * Отказ Google был разовым: с другой машины в ту же минуту шрифт отдавался
 * нормально. Сборка при этом падает целиком — картинка лендинга рендерится
 * заранее, — то есть цена одного неудачного ответа несоразмерна. Повтор
 * ровно один: если сервис лежит, десять попыток лишь растянут падение.
 */
async function withRetry<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    console.error("Шрифт для превью не пришёл, пробую ещё раз", error);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return attempt();
  }
}
