// Чистая часть снаряжения: типы и расчёт готовности.
//
// Вынесено из lib/gear.ts, где лежат запросы к базе. Причина практическая:
// тот модуль импортирует клиент Supabase по алиасу @/, а тесты запускает сам
// Node, который алиасы не разрешает. Заодно так виднее, что здесь нет
// ни ввода-вывода, ни состояния — только правила.

export type GearItem = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  minHikeCategory: number;
};

export type GearOwnership = "own" | "will_get" | "none";

export type MyGearItem = GearItem & { ownership: GearOwnership };

/**
 * До какой категории человек снаряжён.
 *
 * Засчитывается только «есть». «Достану» — это ещё не вещь: раньше оно шло за
 * наличие, и человек, отметивший так ботинки, получал готовность до третьей
 * категории, а на выход приходил в кроссовках. Обещание без даты живёт вечно —
 * отметил в сентябре, в марте оно всё ещё стоит.
 *
 * Возвращает 0, если не хватает даже для первой категории.
 */
export function gearReadyUpTo(items: MyGearItem[]): number {
  let ready = 0;
  for (const category of [1, 2, 3, 4, 5]) {
    const required = items.filter((item) => item.minHikeCategory <= category);
    const notYet = required.filter((item) => item.ownership !== "own");
    if (notYet.length > 0) break;
    ready = category;
  }
  return ready;
}

/** Чего нет и не предвидится — для конкретной категории. */
export function missingForCategory(
  items: MyGearItem[],
  category: number,
): MyGearItem[] {
  return items.filter(
    (item) => item.minHikeCategory <= category && item.ownership === "none",
  );
}

/**
 * Что обещано достать к выходу — для конкретной категории.
 *
 * Отдельно от `missingForCategory`, потому что это разные разговоры: одно
 * «купи или не иди», другое «напомни себе забрать».
 */
export function promisedForCategory(
  items: MyGearItem[],
  category: number,
): MyGearItem[] {
  return items.filter(
    (item) => item.minHikeCategory <= category && item.ownership === "will_get",
  );
}

/** Чего человеку не хватает к конкретному походу — именами, для лидера. */
export type GearGap = {
  missing: string[];
  promised: string[];
};

/**
 * Пробел в снаряжении к категории похода.
 *
 * Не весь набор, а именно пробел: в ростере у лидера одиннадцать пунктов на
 * человека — стена, в которой ничего не видно. Лидер ищет проблемы, а не
 * подтверждения, поэтому у собранного человека список пуст и на экране не
 * появляется ничего.
 *
 * Категория здесь обязательна: на прогулке первой категории кошки и спальник
 * никого не касаются, и напоминать о них значит приучить не читать эту строку.
 */
export function gearGapForCategory(
  items: MyGearItem[],
  category: number,
): GearGap {
  return {
    missing: missingForCategory(items, category).map((item) => item.name),
    promised: promisedForCategory(items, category).map((item) => item.name),
  };
}
