/**
 * Что показать человеку в блоке записи на поход.
 *
 * Порядок веток тут — и есть вся логика, и ошибались в нём уже трижды:
 * гость получал «Войти и записаться» на поход, который прошёл в марте;
 * потом — на поход, запись на который закрылась два дня назад; а записанный
 * участник после закрытия записи видел «Запись закрыта.» вместо «Ты записан»
 * и оставался без кнопки отмены.
 *
 * Общее у всех трёх — ветка стояла раньше той, что важнее. Поэтому решение
 * вынесено из вёрстки в отдельную функцию: порядок, который держится в
 * голове, ломается при каждой правке, а порядок, который держится тестами,
 * не ломается молча.
 *
 * Модуль без импортов приложения — его гоняет `node --test`, а алиас `@/` он
 * не понимает.
 */

export type RegistrationCta =
  /** Прошедший поход: блок не рисуется вовсе, это страница-портфолио. */
  | { kind: "none" }
  | { kind: "leader" }
  | { kind: "registered"; confirmed: boolean; waitlistPos: number | null }
  | { kind: "banned" }
  /** Поход только для участников, а человек ещё не участник. */
  | { kind: "membersOnly" }
  | { kind: "closed"; reason: string }
  | { kind: "signIn" }
  | { kind: "profile"; missing: string[] }
  | { kind: "register" };

export type RegistrationCtaInput = {
  past: boolean;
  signedIn: boolean;
  banned: boolean;
  /**
   * Поход закрыт для новичков, а вошедший — гость или ждёт подтверждения.
   * Для невошедшего значения не имеет: он может оказаться участником.
   */
  membersOnly: boolean;
  registration: {
    status: "confirmed" | "waitlist" | "cancelled";
    waitlistPos: number | null;
    asLeader: boolean;
  } | null;
  closedReason: string | null;
  missingProfileFields: string[];
};

export function registrationCta(input: RegistrationCtaInput): RegistrationCta {
  // Прошедший поход — раньше всего остального. Записываться некуда, и любая
  // кнопка здесь предлагает действие, которого не существует.
  if (input.past) return { kind: "none" };

  // Своя запись — раньше состояния похода.
  //
  // Закрытая запись не отменяет уже сделанную: cancel_registration про окно
  // записи ничего не знает, и правильно — отказываются чаще всего накануне
  // выхода, когда окно давно закрыто. Скрыть тут кнопку отмены значит
  // получить человека, который просто не пришёл, а лидер узнал об этом на
  // точке сбора.
  if (input.registration && input.registration.status !== "cancelled") {
    if (input.registration.asLeader) return { kind: "leader" };
    return {
      kind: "registered",
      confirmed: input.registration.status === "confirmed",
      waitlistPos: input.registration.waitlistPos,
    };
  }

  // Бан — раньше состояния похода: человеку важнее, что дело в нём, а не в
  // дате. Иначе он дождётся открытия записи и упрётся в то же самое.
  if (input.banned) return { kind: "banned" };

  // «Только для участников» — по той же причине раньше дат. До 14 сентября
  // 2026 новичок видел «Записаться», нажимал и только тогда получал отказ
  // MEMBERS_ONLY; а на ещё не открытый поход — ждал открытия ради того же
  // отказа. Здесь ему сразу говорят, куда идти вместо этого.
  if (input.signedIn && input.membersOnly) return { kind: "membersOnly" };

  // Состояние похода — раньше входа.
  //
  // Вход исправляет то, что зависит от человека, и потому стоит высоко. Но
  // закрытую запись он не исправляет: нажатие уводит на страницу входа и
  // возвращает к той же закрытой записи.
  if (input.closedReason) return { kind: "closed", reason: input.closedReason };

  if (!input.signedIn) return { kind: "signIn" };

  if (input.missingProfileFields.length > 0) {
    return { kind: "profile", missing: input.missingProfileFields };
  }

  return { kind: "register" };
}
