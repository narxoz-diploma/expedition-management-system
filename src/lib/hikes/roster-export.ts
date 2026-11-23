// Сборка листов выгрузки. Чистая функция, без обращений к базе, — чтобы её
// можно было прогнать тестом на настоящих формах данных.
//
// Так и появился баг, ради которого этот модуль выделен: в колонку «Курс»
// уходило число с типом String, и write-excel-file падал на весь запрос.
// Проверял я тогда генерацию на выдуманных данных, где все ячейки были
// строками, — и не увидел.

import { formatPhone } from "../phone.ts";
import { fitnessShort } from "../fitness.ts";

import type { RosterEntry } from "./roster.ts";

export type Cell = {
  value: string | number;
  type?: StringConstructor | NumberConstructor;
  fontWeight?: "bold";
};

const header = (text: string): Cell => ({ value: text, fontWeight: "bold" });
const text = (value: string | number | null | undefined): Cell => ({
  // Приводим явно: значение и объявленный тип обязаны совпадать, иначе
  // библиотека бросает исключение и файл не собирается вовсе.
  value: value === null || value === undefined ? "" : String(value),
  type: String,
});
const number = (value: number): Cell => ({ value, type: Number });

export function statusLabel(entry: RosterEntry): string {
  if (entry.status === "waitlist") {
    return `очередь ${entry.waitlistPos ?? ""}`.trim();
  }
  return entry.manualOverride ? "идёт (вручную)" : "идёт";
}

export function attendanceLabel(entry: RosterEntry): string {
  switch (entry.attendance) {
    // Промежуточное состояние: лидер отметил человека на сборе, а итог
    // поставить ещё не успел. В выгрузке оно должно называться своим
    // именем — пустая клетка означала бы «не отмечен», а это другое.
    case "arrived":
      return "пришёл";
    case "completed":
      return "прошёл";
    case "turned_back":
      return "сошёл";
    case "no_show":
      return "не пришёл";
    default:
      return "";
  }
}

/** Лист «Группа»: кто идёт, телефоны, отметки. */
export function buildParticipantsSheet(entries: RosterEntry[]): Cell[][] {
  return [
    [
      header("№"),
      header("Имя"),
      header("Телефон"),
      header("Курс"),
      header("Статус"),
      header("Возраст"),
      header("Форма"),
      header("Отметка"),
      header("Неявки"),
      header("Отметки"),
    ],
    ...entries.map((entry, index) => [
      number(index + 1),
      text(entry.fullName),
      // Телефон строкой: числом Excel съест плюс и ведущие нули.
      text(entry.phone ? formatPhone(entry.phone) : ""),
      text(entry.studyYear),
      text(statusLabel(entry)),
      text(entry.ageOnHike),
      // Самооценка, не допуск: в поле лидеру полезнее знать, кого он ведёт,
      // чем гадать по возрасту и курсу.
      text(fitnessShort(entry.fitnessLevel) ?? ""),
      text(attendanceLabel(entry)),
      number(entry.noShowCount),
      number(entry.strikes.total),
    ]),
  ];
}

/** Лист «На случай ЧП»: кому звонить по каждому участнику. */
export function buildContactsSheet(entries: RosterEntry[]): Cell[][] {
  return [
    [
      header("Участник"),
      header("Его телефон"),
      header("Кому звонить"),
      header("Телефон"),
      header("Родитель"),
    ],
    ...entries.flatMap((entry) => {
      const phone = entry.phone ? formatPhone(entry.phone) : "";

      if (entry.emergencyContacts.length === 0) {
        // Строка нужна даже без контакта: пустая ячейка в файле — это сигнал
        // лидеру, а пропущенная строка просто останется незамеченной.
        return [
          [text(entry.fullName), text(phone), text("НЕ УКАЗАН"), text(""), text("")],
        ];
      }

      return entry.emergencyContacts.map((contact) => [
        text(entry.fullName),
        text(phone),
        text(contact.fullName),
        text(formatPhone(contact.phone)),
        text(contact.isParent ? "да" : ""),
      ]);
    }),
  ];
}
