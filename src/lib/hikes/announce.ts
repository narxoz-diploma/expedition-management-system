// Расширения в относительных импортах здесь обязательны: эти модули
// запускает напрямую Node (node --test), а он, в отличие от сборщика,
// путь без расширения не достраивает.
import {
  CATEGORY_LABELS,
  formatCost,
  formatDateWithWeekday,
  formatDeadline,
  formatNumber,
  formatTime,
  pluralWithNumber,
} from "./format.ts";
import type { Hike } from "./types.ts";
import { spotsLeft } from "./types.ts";
import { cancellationCutoff } from "./cancel-cutoff.ts";

/**
 * Готовый текст анонса для WhatsApp.
 *
 * Это не украшение: по PRD именно эта кнопка решает, станут ли другие лидеры
 * пользоваться сайтом. Лидер и так пишет такое сообщение руками — если сайт
 * отдаёт его готовым, сайт экономит время, а не создаёт работу.
 *
 * Пустые поля просто пропускаются: черновик анонсируют и наполовину
 * заполненным, и текст не должен разваливаться на «undefined».
 *
 * Адреса сбора и ссылки на карту здесь нет и не должно быть. До 7 сентября
 * 2026 они были — с обоснованием «текст пишет лидер, и адрес в чате группы
 * это ровно то место, где он уместен». Обоснование не учло, кто ещё в этом
 * чате: общий чат клуба видят и гости, которые ещё не записались, а место
 * сбора на сайте скрыто именно от них (PRD §4) — раньше на точку приходили
 * люди мимо записи. Печатая адрес в анонсе, который лидер сам вставляет в
 * этот же чат, сайт своими руками открывал ту самую дыру, которую прятал в
 * интерфейсе.
 */
export function buildAnnounce(
  hike: Hike,
  url: string,
  /**
   * Только чтобы решить, есть ли что анонсировать про сбор вообще — сам
   * адрес наружу не идёт, его показывает страница похода записавшимся.
   */
  meeting: { point: string | null },
): string {
  const lines: string[] = [];

  const name = hike.routeName ?? hike.title;
  lines.push(`🏔 ${name} — ${formatDateWithWeekday(hike.startsAt)}`);
  lines.push("");

  lines.push(
    `Категория ${hike.category} из 5 — ${CATEGORY_LABELS[hike.category]}`,
  );

  const stats: string[] = [];
  if (hike.distanceKm !== null) stats.push(`${formatNumber(hike.distanceKm)} км`);
  if (hike.elevationGainM !== null) {
    stats.push(`набор ${hike.elevationGainM} м`);
  }
  if (hike.durationHours !== null) {
    stats.push(`около ${formatNumber(hike.durationHours)} ч`);
  }
  if (stats.length > 0) lines.push(stats.join(", "));

  lines.push("");

  lines.push(`Сбор: ${formatTime(hike.startsAt)}`);
  // Формулировка та же, что на странице похода (см. hikes/[slug]/page.tsx):
  // одно и то же правило должно звучать одинаково везде, где о нём говорят.
  if (meeting.point) {
    lines.push("Место сбора видно тем, кто записан на поход.");
  }

  if (hike.costAmount !== null) {
    const note = hike.costNote ? ` — ${hike.costNote}` : "";
    lines.push(`Расходы: около ${formatCost(hike.costAmount)}${note}`);
  }

  const left = spotsLeft(hike);
  lines.push(
    left > 0
      ? `Свободно ${pluralWithNumber(left, "место", "места", "мест")} из ${hike.capacity}`
      : `Мест нет, но можно записаться в лист ожидания`,
  );
  // Рубеж — в анонсе, а не только на странице: большая часть поздних отмен
  // от незнания правила, и знать его надо до записи.
  lines.push(`Отменить без последствий — до ${formatDeadline(cancellationCutoff(hike))}`);

  // Про расписку — в анонсе, а не только на странице: бумагу надо
  // распечатать и подписать заранее, а несовершеннолетнему ещё и дать
  // родителю. Человек, узнавший о ней в день выхода, приедет без неё.
  //
  // Строка безусловна. Раньше она зависела от того, приложил ли лидер файлы,
  // и забытая загрузка убирала из анонса единственное упоминание бумаги, без
  // которой на сборе разворачивают. Расписка нужна на каждый поход, значит и
  // говорить о ней надо всегда.
  lines.push("Нужна подписанная расписка — бланк на странице похода. Без неё не выпускаем.");

  if (hike.openToNewcomers) {
    lines.push("Можно новичкам — если ты ещё не был с нами, это твой поход.");
  }

  lines.push("");
  lines.push(`Записаться: ${url}`);

  return lines.join("\n");
}

/**
 * Текст объявления об отмене похода.
 *
 * Раньше здесь было «Записи отменены» — а они не отменяются: отмена похода
 * меняет только его статус. И правильно, что не отменяются: по списку
 * записавшихся лидер и понимает, кого обзванивать. Но обещать в чате то,
 * чего система не делает, нельзя.
 */
export function buildCancellationAnnounce(hike: Hike): string {
  const name = hike.routeName ?? hike.title;
  const lines = [
    `❗️ ${name} ${formatDateWithWeekday(hike.startsAt)} отменяется.`,
  ];

  if (hike.cancelledReason) {
    lines.push("");
    lines.push(hike.cancelledReason);
  }

  lines.push("");
  lines.push("Отдельно отменять запись не нужно — поход не состоится.");
  lines.push("Следующий поход анонсируем отдельно.");

  return lines.join("\n");
}
