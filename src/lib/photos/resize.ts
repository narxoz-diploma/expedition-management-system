/**
 * Сжатие снимка в браузере, до загрузки.
 *
 * Почему в браузере, а не на сервере: лидер отбирает фотографии с телефона,
 * часто с мобильного интернета. Пятнадцать кадров по 8 МБ — это 120 МБ вверх,
 * несколько минут, и любой обрыв связи начинает всё заново. После сжатия
 * уходит 4–6 МБ, то есть секунды. Серверная обработка эту часть не лечит
 * вовсе: файл всё равно надо сперва доставить.
 */

import {
  AVATAR_PX,
  AVATAR_QUALITY,
  FULL_MAX_PX,
  JPEG_QUALITY,
  THUMB_MAX_PX,
  centerSquare,
  downscaleSteps,
  fitWithin,
} from "./sizes";

export type ResizedPhoto = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
};

function newCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузер не дал холст для сжатия");

  // По умолчанию браузер уменьшает быстро и грубо. Разница видна именно на
  // лицах — ради них и включаем.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  return { canvas, ctx };
}

/**
 * Уменьшение в несколько шагов вместо одного.
 *
 * Одним `drawImage` из 3000 px сразу в 640 браузер выбрасывает большую часть
 * пикселей — это и есть то мыло, из-за которого аватары выглядели хуже
 * оригинала. Половинными шагами сумма получается заметно чётче, ценой двух-трёх
 * лишних отрисовок.
 *
 * `crop` задаёт, какую часть исходника брать: аватару нужен квадрат по центру,
 * снимку похода — весь кадр.
 */
function drawScaled(
  source: ImageBitmap,
  crop: { x: number; y: number; width: number; height: number },
  target: { width: number; height: number },
): HTMLCanvasElement {
  const steps = downscaleSteps(
    crop.width,
    crop.height,
    target.width,
    target.height,
  );

  let current: ImageBitmap | HTMLCanvasElement = source;
  let from = crop;

  for (const step of steps) {
    const { canvas, ctx } = newCanvas(step.width, step.height);
    ctx.drawImage(
      current,
      from.x,
      from.y,
      from.width,
      from.height,
      0,
      0,
      step.width,
      step.height,
    );
    current = canvas;
    // После первого шага обрезка уже применена — дальше берём холст целиком.
    from = { x: 0, y: 0, width: step.width, height: step.height };
  }

  const { canvas, ctx } = newCanvas(target.width, target.height);
  ctx.drawImage(
    current,
    from.x,
    from.y,
    from.width,
    from.height,
    0,
    0,
    target.width,
    target.height,
  );
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сжать снимок"))),
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * Из файла — два JPEG: для просмотра и миниатюра.
 *
 * `imageOrientation: "from-image"` обязателен. Телефоны почти всегда снимают
 * матрицей в одной ориентации, а поворот пишут в EXIF отдельным полем — без
 * этого флага половина вертикальных кадров ляжет на бок, причём именно на
 * сайте, потому что галерея телефона EXIF читает и показывает правильно.
 */
export async function resizePhoto(file: File): Promise<ResizedPhoto> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const whole = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };

    const fullSize = fitWithin(bitmap.width, bitmap.height, FULL_MAX_PX);
    const thumbSize = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_PX);

    const full = await toJpeg(drawScaled(bitmap, whole, fullSize), JPEG_QUALITY);
    const thumb = await toJpeg(
      drawScaled(bitmap, whole, thumbSize),
      JPEG_QUALITY,
    );

    return { full, thumb, width: fullSize.width, height: fullSize.height };
  } finally {
    // Битмап держит несжатые пиксели: 6000×4000 — это под сотню мегабайт.
    // На пятнадцати снимках подряд без этого вкладка на телефоне падает.
    bitmap.close();
  }
}

/**
 * Аватар: квадрат по центру, 640×640, с качеством повыше.
 *
 * Тот же путь, что и у снимков похода, — общий модуль ради того, чтобы
 * поворот из EXIF и ступенчатое уменьшение не пришлось чинить дважды.
 */
export async function resizeAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const { x, y, size } = centerSquare(bitmap.width, bitmap.height);
    const canvas = drawScaled(
      bitmap,
      { x, y, width: size, height: size },
      { width: AVATAR_PX, height: AVATAR_PX },
    );
    return await toJpeg(canvas, AVATAR_QUALITY);
  } finally {
    bitmap.close();
  }
}
