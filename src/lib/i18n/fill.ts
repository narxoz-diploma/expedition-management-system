/**
 * «Меню, {name}» + { name: "Айгерим" } → «Меню, Айгерим».
 *
 * Отдельным модулем, а не в dictionary.ts: тот импортирует все три словаря, и
 * клиентский компонент, взявший оттуда одну эту функцию, утаскивал в браузер
 * тексты всего сайта на трёх языках. Клиентские компоненты берут fill отсюда,
 * а словарь им приходит пропсом — только нужный кусок.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
