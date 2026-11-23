/**
 * Возраст — отдельным модулем без импортов приложения.
 *
 * Вынесен из `profile.ts` ради тестов: `node --test` не понимает алиас `@/`,
 * а `profile.ts` тянет за собой клиент Supabase. Считается тут ровно одно —
 * сколько человеку лет на заданную дату.
 */

/**
 * Возраст на дату похода. По нему решается и нужно ли согласие родителя, и
 * какой бланк расписки показать.
 *
 * Именно на дату похода, а не на сегодня: восемнадцать, исполняющиеся между
 * записью и выходом, меняют ответ на оба вопроса.
 */
export function ageOn(birthDate: string, onDate: string): number {
  const birth = new Date(birthDate);
  const at = new Date(onDate);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = at.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}
