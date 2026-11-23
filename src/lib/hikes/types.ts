export type HikeStatus = "draft" | "published" | "cancelled" | "completed";

/** Категория сложности: 1 — прогулка, 5 — серьёзный маршрут с ночёвкой. */
export type HikeCategory = 1 | 2 | 3 | 4 | 5;

export type Hike = {
  id: string;
  slug: string;
  title: string;
  routeName: string | null;
  summary: string | null;
  description: string | null;

  category: HikeCategory;
  distanceKm: number | null;
  elevationGainM: number | null;
  durationHours: number | null;

  startsAt: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;

  /**
   * Точка маршрута для прогноза — не точка сбора: та в городе, на 800 м.
   * Высота задаётся отдельно, из набора её не вывести (набор — это разница,
   * а стартовая высота нигде не хранится).
   */
  routeLat: number | null;
  routeLon: number | null;
  routeAltitudeM: number | null;

  capacity: number;
  openToNewcomers: boolean;
  confirmedCount: number;
  waitlistCount: number;
  /** Сколько лидеров идёт. Мест участников не занимают. */
  leaderCount: number;

  costAmount: number | null;
  costNote: string | null;

  coverUrl: string | null;
  status: HikeStatus;
  leaderId: string;
  cancelledReason: string | null;
};

// TODO: заменить на типы, сгенерированные из Supabase
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
// Пока описано руками ровно то, что читается запросами, — так расхождение со
// схемой заметно сразу, а не прячется в большом файле.
export type HikeRow = {
  id: string;
  slug: string;
  title: string;
  route_name: string | null;
  summary: string | null;
  description: string | null;
  category: number;
  distance_km: number | string | null;
  elevation_gain_m: number | null;
  duration_hours: number | string | null;
  starts_at: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  route_lat: number | string | null;
  route_lon: number | string | null;
  route_altitude_m: number | null;
  capacity: number;
  open_to_newcomers: boolean;
  confirmed_count: number;
  waitlist_count: number;
  leader_count: number;
  cost_amount: number | null;
  cost_note: string | null;
  cover_url: string | null;
  status: HikeStatus;
  leader_id: string;
  cancelled_reason: string | null;
};

/**
 * numeric из Postgres приезжает строкой, а не числом: точность произвольная,
 * и драйвер не рискует терять её в double. Молча передать такое в вёрстку
 * значит получить «10.0 км» склеенным как текст.
 */
function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapHike(row: HikeRow): Hike {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    routeName: row.route_name,
    summary: row.summary,
    description: row.description,
    category: row.category as HikeCategory,
    distanceKm: toNumber(row.distance_km),
    elevationGainM: row.elevation_gain_m,
    durationHours: toNumber(row.duration_hours),
    startsAt: row.starts_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    // numeric, а значит приезжает строкой — как distance_km.
    routeLat: toNumber(row.route_lat),
    routeLon: toNumber(row.route_lon),
    routeAltitudeM: row.route_altitude_m,
    capacity: row.capacity,
    openToNewcomers: row.open_to_newcomers,
    confirmedCount: row.confirmed_count,
    waitlistCount: row.waitlist_count,
    leaderCount: row.leader_count,
    costAmount: row.cost_amount,
    costNote: row.cost_note,
    coverUrl: row.cover_url,
    status: row.status,
    leaderId: row.leader_id,
    cancelledReason: row.cancelled_reason,
  };
}

// Место сбора здесь отсутствует намеренно: права на meeting_point и
// meeting_point_url у клиента отобраны (миграция 20260812), и запрос с ними
// упал бы целиком, вместе со всей карточкой похода. Адрес берётся отдельно —
// см. lib/hikes/meeting-point.ts.
export const HIKE_COLUMNS =
  "id, slug, title, route_name, summary, description, category, distance_km, " +
  "elevation_gain_m, duration_hours, starts_at, " +
  "registration_opens_at, registration_closes_at, " +
  "route_lat, route_lon, route_altitude_m, capacity, open_to_newcomers, " +
  "confirmed_count, waitlist_count, leader_count, cost_amount, cost_note, cover_url, status, " +
  "leader_id, cancelled_reason";

/** Свободные места. Не бывает отрицательным: лидер может урезать вместимость. */
export function spotsLeft(hike: Hike): number {
  return Math.max(hike.capacity - hike.confirmedCount, 0);
}

/**
 * Поход уже состоялся.
 *
 * Прошедшие походы работают как портфолио клуба, и говорить про них надо в
 * прошедшем времени. Без этой проверки поход двухлетней давности показывал
 * «Осталось 25 из 25» и метку «Можно новичкам» — то есть приглашал
 * записаться туда, куда сходили позапрошлой осенью.
 */
export function isPastHike(hike: Hike, now: Date): boolean {
  return new Date(hike.startsAt) < now;
}

/** Сколько человек было на маршруте: участники плюс лидеры. */
export function totalOnTrail(hike: Hike): number {
  return hike.confirmedCount + hike.leaderCount;
}

/**
 * С какого числа свободных мест счётчик считается «последними местами».
 *
 * Доля, а не фиксированное число: пять оставшихся из двадцати пяти — это
 * действительно почти всё разобрано, а пять из десяти — половина группы
 * свободна. С абсолютным порогом маленький поход загорался «поторопись»
 * ровно посередине набора.
 *
 * Нижняя граница в три места нужна для совсем маленьких групп: без неё поход
 * на восьмерых предупреждал бы только на последних двух, когда торопиться
 * уже поздно.
 */
export function runningOutThreshold(capacity: number): number {
  return Math.max(3, Math.ceil(capacity / 4));
}
