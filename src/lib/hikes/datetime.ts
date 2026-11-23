import { CLUB_TIMEZONE } from "./format.ts";

/**
 * Смещение часового пояса в минутах на конкретный момент.
 *
 * Считается через Intl, а не константой «+5». Казахстан переводил стрелки в
 * 2024 году, и захардкоженное смещение — это отложенная поломка, которая
 * проявится как «все походы сдвинулись на час» через несколько лет.
 */
function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  // Ожидается вид GMT+05:00; для UTC Intl отдаёт просто GMT.
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * «2026-09-14T06:30» из формы → ISO в UTC для базы.
 *
 * Поле datetime-local отдаёт время без пояса, и подразумевается местное.
 * Сервер на Vercel живёт в UTC: без пересчёта поход, назначенный на 6:30 утра,
 * уехал бы в базу как 6:30 UTC, то есть 11:30 по Алматы.
 */
export function clubLocalToUtcIso(local: string): string {
  // Сначала читаем как UTC, чтобы получить точку отсчёта нужной даты:
  // смещение зависит от даты, а даты у нас пока нет.
  const provisional = new Date(`${local}:00.000Z`);
  if (Number.isNaN(provisional.getTime())) {
    throw new Error(`Не удалось разобрать дату: ${local}`);
  }

  const offset = timeZoneOffsetMinutes(provisional, CLUB_TIMEZONE);
  return new Date(provisional.getTime() - offset * 60_000).toISOString();
}

/**
 * ISO из базы → «2026-09-14T06:30» для подстановки в форму.
 * Обратная операция к clubLocalToUtcIso.
 */
export function utcIsoToClubLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  // hourCycle h23 иногда отдаёт 24 вместо 00 для полуночи.
  const hour = get("hour") === "24" ? "00" : get("hour");

  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
