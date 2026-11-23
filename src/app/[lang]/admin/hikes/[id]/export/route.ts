import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";

import { requireStaff } from "@/lib/auth-guards";
import { getHikeById } from "@/lib/hikes/queries";
import {
  buildContactsSheet,
  buildParticipantsSheet,
} from "@/lib/hikes/roster-export";
import { getRoster } from "@/lib/hikes/roster";
import { buildHikeSlug } from "@/lib/hikes/slug";

/**
 * Выгрузка списка группы в XLSX.
 *
 * Два листа: группа и контакты на случай ЧП. Скачивается заранее, накануне
 * выхода — файл нужен ровно тогда, когда интернета нет.
 *
 * Данные приходят из getRoster(), то есть под политиками RLS: лидер чужого
 * похода получит пустой список, а не чужие телефоны.
 *
 * Сборка листов живёт в lib/hikes/roster-export.ts и покрыта тестами. Здесь
 * остаётся только ввод-вывод: содержимое файла один раз уже уронило весь
 * запрос, и повторять это негде.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff();

    const { id } = await params;
    const hike = await getHikeById(id);
    if (!hike) {
      return NextResponse.json({ error: "Поход не найден" }, { status: 404 });
    }

    // Категория нужна ростеру для пробелов в снаряжении. В выгрузку они
    // намеренно не идут: файл берут на маршрут, а снаряжение — разговор до
    // выхода, и в XLSX его никто уже не прочитает.
    const roster = await getRoster(hike.id, hike.startsAt, hike.category);
    const everyone = [...roster.confirmed, ...roster.waitlist];

    if (everyone.length === 0) {
      return NextResponse.json(
        { error: "На поход пока никто не записан" },
        { status: 409 },
      );
    }

    const file = await writeXlsxFile(
      [
        {
          data: buildParticipantsSheet(everyone),
          sheet: "Группа",
          // Шапка остаётся на месте при прокрутке: в группе бывает 25 человек.
          stickyRowsCount: 1,
          columns: [
            { width: 5 },
            { width: 28 },
            { width: 20 },
            { width: 8 },
            { width: 16 },
            { width: 10 },
            { width: 14 },
            { width: 9 },
            { width: 16 },
          ],
        },
        {
          data: buildContactsSheet(everyone),
          sheet: "На случай ЧП",
          stickyRowsCount: 1,
          columns: [
            { width: 28 },
            { width: 20 },
            { width: 28 },
            { width: 20 },
            { width: 10 },
          ],
        },
      ],
    );

    const buffer = await file.toBuffer();

    // Имя файла латиницей: кириллица в Content-Disposition ломается в части
    // браузеров, а файл лидер потом ищет глазами в папке загрузок.
    const name = `${buildHikeSlug(hike.routeName ?? hike.title, hike.startsAt)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Иначе любая осечка внутри превращается в голый 500 без единой подсказки —
    // ровно так эта выгрузка и сломалась в первый раз.
    console.error("Не удалось собрать выгрузку", error);
    return NextResponse.json(
      { error: "Не удалось собрать файл. Скажи разработчику." },
      { status: 500 },
    );
  }
}

// Файл собирается под конкретного лидера и конкретный поход — кешировать
// его нельзя ни на секунду.
export const dynamic = "force-dynamic";
