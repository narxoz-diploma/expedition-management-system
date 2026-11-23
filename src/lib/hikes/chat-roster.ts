/**
 * Раскладка состава похода по работе, которую лидер делает в WhatsApp.
 *
 * Чат под поход собирается вручную и по одному человеку: при добавлении
 * пачкой WhatsApp отбивает всю пачку, если хотя бы у одного стоит запрет на
 * добавление в группы, и не говорит, у кого именно. Двадцать пять человек
 * по одному — это несколько заходов, поэтому экран показывает не список, а
 * остаток работы: сделанные строки сворачиваются, несделанные остаются.
 *
 * Модуль без импортов приложения — его гоняет `node --test`, а алиас `@/`
 * он не понимает.
 */

/**
 * `added` — человек в чате, неважно, добавили его по номеру или он зашёл
 * сам по ссылке. `invited` — ссылку отправили, но в чате его ещё нет.
 *
 * Названия описывают положение человека, а не действие лидера: первое
 * прочтение («добавил по номеру») оставляло переход «зашёл по ссылке»
 * без кнопки вовсе.
 */
export type ChatStatus = "added" | "invited";

export type ChatRow = {
  userId: string;
  fullName: string;
  phone: string | null;
  status: "confirmed" | "waitlist" | "cancelled";
  asLeader: boolean;
  chatStatus: ChatStatus | null;
  chatStatusAt: string | null;
  /** Момент подъёма из очереди; null — записался на свободное место сам. */
  promotedAt: string | null;
  createdAt: string;
  cancelledAt: string | null;
};

export type ChatPerson = ChatRow & {
  /**
   * Поднялся из очереди, и лидер его ещё не трогал.
   *
   * Уведомлений в проекте нет: человек узнаёт о месте, только если сам зайдёт
   * на сайт. Поэтому ему сперва пишут «идёшь?», а добавляют уже потом —
   * иначе он оказывается в чате похода, на который, как он думал, не попал.
   */
  unaware: boolean;
};

export type ChatRoster = {
  /**
   * Незакрытая работа, в порядке экрана: лидеры первыми, дальше участники
   * по времени записи. Ждущие остаются здесь, а не уезжают к сделанным, —
   * их в чате нет, и работа с ними не кончена.
   */
  active: ChatPerson[];
  /** Уже в чате. Сворачиваются: делать с ними нечего. */
  done: ChatPerson[];
  /** Из active — кого ещё не трогали вовсе. */
  untouched: ChatPerson[];
  /** Из active — кому отправили ссылку и кто ещё не зашёл. */
  waiting: ChatPerson[];
  /**
   * Кто отменился уже после того, как попал в чат. По одной строке на
   * человека и без снятых лидеров.
   */
  toRemove: ChatPerson[];
  /** Сколько всего человек должно оказаться в чате, кроме смотрящего. */
  total: number;
};

/**
 * `viewerId` обязателен, а не с умолчанием «никто»: необязательный аргумент
 * здесь уже однажды забыли во всех вызовах разом (см. canEditHike).
 */
export function chatRoster(
  rows: readonly ChatRow[],
  viewerId: string,
): ChatRoster {
  // Отменённая и новая запись одного человека живут двумя строками:
  // уникальность в базе частичная, `where status <> 'cancelled'`. Без этой
  // склейки передумавший попал бы разом и в «добавить», и в «убрать».
  const active = new Set(
    rows.filter((row) => row.status !== "cancelled").map((row) => row.userId),
  );

  // Себя не показываем: чат собирает создатель группы, и он в ней по
  // определению. Строка «добавь себя» висела бы в «осталось» вечно.
  // Остальные лидеры остаются — второго лидера добавляют по номеру так же,
  // как участника, и забыть именно его хуже всего.
  const people = rows.filter((row) => row.userId !== viewerId).map(toPerson);
  const byCreated = (a: ChatPerson, b: ChatPerson) =>
    a.createdAt.localeCompare(b.createdAt);

  // Лидеры первыми: их добавляют в первую очередь, и без них чат — не чат.
  const onScreen = [
    ...people.filter((p) => p.asLeader && p.status !== "cancelled"),
    ...people.filter((p) => p.status === "confirmed" && !p.asLeader).sort(byCreated),
  ];

  const working = onScreen.filter((p) => p.chatStatus !== "added");

  return {
    active: working,
    done: onScreen.filter((p) => p.chatStatus === "added"),
    untouched: working.filter((p) => p.chatStatus === null),
    waiting: working.filter((p) => p.chatStatus === "invited"),
    toRemove: uniqueByUser(
      people
        .filter(
          (p) =>
            p.status === "cancelled" &&
            // Снятие лидера — не отмена человеком, а решение ответственного,
            // и «отменили запись» про него врёт. Выгонять лидера из группы
            // сайт не подсказывает: это решается разговором, а не списком.
            !p.asLeader &&
            p.chatStatus !== null &&
            !active.has(p.userId),
        )
        // Свежие отмены сверху: перед выходом важна последняя, а не первая.
        .sort((a, b) => (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? "")),
    ),
    total: onScreen.length,
  };
}

/**
 * Отменённых строк на одного человека бывает сколько угодно — уникальность
 * частичная. Назначили лидером, отметили в чате, сняли, назначили снова,
 * сняли — и экран печатал «убрать 2 человека» с одним номером дважды.
 * Список уже отсортирован, так что остаётся последняя отмена.
 */
function uniqueByUser(people: ChatPerson[]): ChatPerson[] {
  const seen = new Set<string>();
  return people.filter((p) => {
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });
}

function toPerson(row: ChatRow): ChatPerson {
  return {
    ...row,
    unaware:
      row.status === "confirmed" &&
      row.promotedAt !== null &&
      row.chatStatus === null,
  };
}
