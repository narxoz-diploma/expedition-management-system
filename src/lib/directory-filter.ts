/**
 * Отбор людей в справочнике клуба.
 *
 * Живёт отдельно от экрана, потому что правила поиска ошибаются молча: номер
 * хранится как `+7701…`, а набирают его то с восьмёркой, то с пробелами, то
 * последними четырьмя цифрами. Такое проверяется тестом, а не глазами.
 *
 * Модуль без импортов приложения — его гоняет `node --test`.
 */

export type MembershipFilter = "all" | "member" | "guest" | "alumni";

export type Filterable = {
  fullName: string;
  phone: string | null;
  membershipStatus: string;
  chatStatus: string | null;
};

export type DirectoryFilter = {
  query: string;
  status: MembershipFilter;
  /** Оставить только тех, кого ещё нет в общем чате. */
  notInChat: boolean;
};

export function filterDirectory<T extends Filterable>(
  people: readonly T[],
  filter: DirectoryFilter,
): T[] {
  return people.filter(
    (person) =>
      matchesStatus(person, filter.status) &&
      (!filter.notInChat || person.chatStatus === null) &&
      matchesQuery(person, filter.query),
  );
}

function matchesStatus(person: Filterable, status: MembershipFilter): boolean {
  if (status === "all") return true;
  // Заявки показываем вместе с гостями: для лидера это один и тот же человек
  // с улицы, разница только в том, попросил он подтвердить членство или нет.
  if (status === "guest") {
    return person.membershipStatus === "guest" || person.membershipStatus === "pending";
  }
  return person.membershipStatus === status;
}

export function matchesQuery(person: Filterable, query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === "") return true;

  if (person.fullName.toLowerCase().includes(trimmed.toLowerCase())) return true;

  // По цифрам, а не по строке: в базе номер лежит как «+77012345678», а
  // набирают «8 701», «701 234» или последние четыре. Сравнение как есть
  // не совпало бы ни с одним из этих вариантов.
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 3 || !person.phone) return false;

  const stored = person.phone.replace(/\D/g, "");
  if (stored.includes(digits)) return true;

  // Восьмёрка в начале — привычная запись того же кода страны. Пробуем
  // второй формой, а не переписываем запрос: «8» может оказаться и просто
  // цифрой из середины номера, и терять такое совпадение незачем.
  return digits.startsWith("8") && stored.includes("7" + digits.slice(1));
}
