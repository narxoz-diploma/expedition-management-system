import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  FULL_MAX_PX,
  THUMB_MAX_PX,
  MIN_COVER_PX,
  centerSquare,
  downscaleSteps,
  fitWithin,
  isTooSmallForCover,
} from "./sizes.ts";

describe("вписывание кадра в габарит", () => {
  it("уменьшает по длинной стороне, сохраняя пропорции", () => {
    // Типичный кадр с фотоаппарата, 3:2.
    const r = fitWithin(6000, 4000, FULL_MAX_PX);
    assert.equal(r.width, FULL_MAX_PX);
    assert.equal(r.height, 1334);
  });

  it("понимает вертикальный кадр", () => {
    // Снимок с телефона: длинная сторона теперь высота.
    const r = fitWithin(3000, 4000, FULL_MAX_PX);
    assert.equal(r.height, FULL_MAX_PX);
    assert.equal(r.width, 1500);
  });

  it("не растягивает маленькие снимки", () => {
    // Увеличенный кадр стал бы мыльным и втрое тяжелее, не добавив деталей.
    const r = fitWithin(800, 600, FULL_MAX_PX);
    assert.deepEqual(r, { width: 800, height: 600 });
  });

  it("не трогает кадр ровно по границе", () => {
    const r = fitWithin(FULL_MAX_PX, 1000, FULL_MAX_PX);
    assert.deepEqual(r, { width: FULL_MAX_PX, height: 1000 });
  });

  it("делает миниатюру из того же кадра", () => {
    const r = fitWithin(6000, 4000, THUMB_MAX_PX);
    assert.equal(r.width, THUMB_MAX_PX);
    assert.equal(r.height, 400);
  });

  it("не отдаёт нулевую сторону на панораме", () => {
    // 1 px против 12000 — округление вниз дало бы высоту 0 и пустой холст.
    const r = fitWithin(12000, 1, THUMB_MAX_PX);
    assert.equal(r.width, THUMB_MAX_PX);
    assert.ok(r.height >= 1, "высота схлопнулась в ноль");
  });

  it("не роняет квадрат", () => {
    const r = fitWithin(4000, 4000, FULL_MAX_PX);
    assert.deepEqual(r, { width: FULL_MAX_PX, height: FULL_MAX_PX });
  });
});

describe("квадрат для аватара", () => {
  it("берёт центр вертикального кадра", () => {
    // Селфи 3:4. Верхний квадрат срезал бы подбородок, оставив небо.
    const r = centerSquare(3000, 4000);
    assert.equal(r.size, 3000);
    assert.equal(r.x, 0);
    assert.equal(r.y, 500);
  });

  it("берёт центр горизонтального кадра", () => {
    const r = centerSquare(4000, 3000);
    assert.equal(r.size, 3000);
    assert.equal(r.x, 500);
    assert.equal(r.y, 0);
  });

  it("не трогает уже квадратный", () => {
    assert.deepEqual(centerSquare(800, 800), { x: 0, y: 0, size: 800 });
  });

  it("не выходит за кадр на нечётной разнице", () => {
    // Округление в другую сторону дало бы x + size > width и пустую полосу.
    const r = centerSquare(1001, 500);
    assert.ok(r.x + r.size <= 1001, "квадрат вылез за правый край");
  });
});

describe("уменьшение в несколько шагов", () => {
  it("половинит, пока не подойдёт к цели ближе чем вдвое", () => {
    // 3000 → 1500 → 750, дальше 375 уже мельче 640, значит последний шаг
    // рисуется прямо в цель.
    const steps = downscaleSteps(3000, 3000, 640, 640);
    assert.deepEqual(steps, [
      { width: 1500, height: 1500 },
      { width: 750, height: 750 },
    ]);
  });

  it("не делает шагов, когда уменьшать почти нечего", () => {
    // Меньше чем вдвое — билинейная интерполяция и так справляется.
    assert.deepEqual(downscaleSteps(900, 900, 640, 640), []);
    assert.deepEqual(downscaleSteps(640, 640, 640, 640), []);
  });

  it("не растягивает и не зацикливается на маленьком кадре", () => {
    // Кадр мельче цели вообще не должен порождать шагов.
    assert.deepEqual(downscaleSteps(300, 300, 640, 640), []);
  });

  it("держит пропорции на неквадратном кадре", () => {
    const steps = downscaleSteps(6000, 4000, 2000, 1334);
    for (const s of steps) {
      assert.ok(
        Math.abs(s.width / s.height - 1.5) < 0.01,
        `пропорции поехали: ${s.width}×${s.height}`,
      );
    }
  });

  it("не отдаёт саму цель промежуточным шагом", () => {
    // Иначе последний drawImage рисовал бы кадр в его же размер — лишняя
    // отрисовка без единого изменённого пикселя.
    const steps = downscaleSteps(1280, 1280, 640, 640);
    assert.deepEqual(steps, []);
  });

  it("шаги идут строго на уменьшение", () => {
    const steps = downscaleSteps(8000, 6000, 600, 450);
    let prev = 8000;
    for (const s of steps) {
      assert.ok(s.width < prev, "шаг не уменьшил кадр");
      prev = s.width;
    }
    assert.ok(steps.length > 0, "на уменьшении в 13 раз шагов не нашлось");
  });
});

describe("годится ли снимок в обложку", () => {
  it("отбивает то, что мессенджер уже ужал", () => {
    // Ровно такие файлы и приехали на прод: 240 и 375 по ширине.
    assert.equal(isTooSmallForCover(240), true);
    assert.equal(isTooSmallForCover(375), true);
  });

  it("пропускает кадр с камеры и телефона", () => {
    assert.equal(isTooSmallForCover(2000), false);
    assert.equal(isTooSmallForCover(MIN_COVER_PX), false);
  });

  it("порог не задран: пограничное проходит, а не ругается", () => {
    // Ругаться на всё подряд вреднее, чем пропустить пограничный случай.
    assert.equal(isTooSmallForCover(MIN_COVER_PX - 1), true);
    assert.equal(isTooSmallForCover(MIN_COVER_PX + 1), false);
  });
});
