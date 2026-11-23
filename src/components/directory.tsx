"use client";

import { useMemo, useState } from "react";

import { DirectoryRow } from "@/components/directory-row";
import { buttonClass, calloutClass, fieldClass } from "@/components/ui";
import {
  filterDirectory,
  type MembershipFilter,
} from "@/lib/directory-filter";
import type { DirectoryPerson } from "@/lib/directory";

const FILTERS: { value: MembershipFilter; label: string }[] = [
  { value: "all", label: "Все" },
  // Не «Участники»: так называется вся страница, где и гости, и выпускники,
  // и одно слово означало два разных списка.
  { value: "member", label: "Члены клуба" },
  { value: "guest", label: "Гости" },
  { value: "alumni", label: "Выпускники" },
];

/**
 * Справочник: поиск и фильтры.
 *
 * Всё на клиенте, и это не лень, а исправление. Сперва здесь стояла форма с
 * GET: запрос жил в адресе, его можно было переслать. Переслать список клуба
 * оказалось некому, а платил за это лидер — нажатием кнопки и перезагрузкой
 * страницы на каждый запрос, включая «стереть и посмотреть всех снова».
 * Строки и так все на странице, фильтровать их надо на месте.
 *
 * Отметка «в общем чате» у строки своя, и фильтр её не видит: человек,
 * отмеченный только что, остаётся на месте до перезагрузки. Иначе в режиме
 * «Не в общем чате» строка исчезала бы из-под пальца, который её нажал.
 */
export function Directory({
  people,
  truncatedAt,
}: {
  people: DirectoryPerson[];
  /** Потолок выборки, если она в него упёрлась; иначе клуб пришёл целиком.
      Числом, а не флагом: сам потолок живёт в lib/directory рядом с
      запросом, а тот тянет за собой next/headers и в клиент не ходит. */
  truncatedAt: number | null;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MembershipFilter>("all");
  const [notInChat, setNotInChat] = useState(false);

  const found = useMemo(
    () => filterDirectory(people, { query, status, notInChat }),
    [people, query, status, notInChat],
  );

  return (
    <>
      <div className="mt-8">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя или номер"
          aria-label="Поиск по клубу"
          className={fieldClass()}
        />
      </div>

      {/* Подсветка через selected у buttonClass(), а не классами поверх:
          дописанное сверху дважды проигрывало базовым классам кнопки — см.
          комментарий к SELECTED в components/ui.ts. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={filter.value === status}
            onClick={() => setStatus(filter.value)}
            className={buttonClass({
              size: "sm",
              selected: filter.value === status,
            })}
          >
            {filter.label}
          </button>
        ))}
        {/* Режим сборки общего чата: остаются те, кого туда ещё не добавили. */}
        <button
          type="button"
          aria-pressed={notInChat}
          onClick={() => setNotInChat((on) => !on)}
          className={buttonClass({ size: "sm", selected: notInChat })}
        >
          Не в общем чате
        </button>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">
          {/* «Найдено» — только когда что-то искали: «Найдено — 279» без
              всякого поиска читалось как ответ на вопрос, которого не было. */}
          {found.length === 0
            ? "Никого не нашлось"
            : query || status !== "all" || notInChat
              ? `Найдено — ${found.length}`
              : `Весь клуб — ${found.length}`}
        </h2>

        {/* Обрезанная выборка обязана говорить об этом вслух: молчащий лимит
            неотличим от «человека нет в клубе» — поиск идёт по загруженным
            строкам, а не по базе. */}
        {truncatedAt !== null && (
          <p className={calloutClass({ tone: "accent", className: "mt-4 text-sm" })}>
            Клуб больше {truncatedAt} человек — показаны первые {truncatedAt} по
            алфавиту, и поиск ищет только среди них. Дальше списком не
            обойтись, нужен поиск на сервере.
          </p>
        )}

        {found.length === 0 ? (
          <p className="mt-4 text-fg-muted">
            {query
              ? "По этому запросу никого нет. Попробуй часть имени или последние цифры номера."
              : "В этой группе пока никого."}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {found.map((person) => (
              <DirectoryRow key={person.id} person={person} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
