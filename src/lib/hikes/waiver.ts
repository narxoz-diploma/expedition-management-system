/**
 * Расписка участника: какой бланк кому и что вообще годится в бланки.
 *
 * Модуль без импортов приложения — его гоняет `node --test`, а алиас `@/` он
 * не понимает. Здесь только чистая логика, работа с хранилищем и базой живёт
 * в server actions.
 */

export const WAIVER_FORMS_BUCKET = "waiver-forms";

/** Кто подписывает: совершеннолетний сам или родитель за него. */
export type WaiverKind = "adult" | "minor";

export const WAIVER_KINDS: WaiverKind[] = ["adult", "minor"];

export function isWaiverKind(value: string): value is WaiverKind {
  return value === "adult" || value === "minor";
}

export const WAIVER_LABELS: Record<WaiverKind, string> = {
  adult: "Для совершеннолетних",
  minor: "Для тех, кому нет 18 — подписывает родитель",
};

/**
 * Какой бланк показать человеку.
 *
 * Возраст считается на день похода, а не на сегодня: восемнадцать,
 * исполняющиеся за неделю до выхода, — обычное дело в студенческом клубе, и
 * такому человеку нужен взрослый бланк.
 *
 * null означает «не знаем»: дата рождения в профиле необязательна. Гадать
 * здесь нельзя — ошибка в сторону взрослого бланка означает поход
 * несовершеннолетнего без согласия родителя, поэтому неизвестный возраст
 * показывает оба бланка и объяснение.
 */
export function waiverKindForAge(ageOnHike: number | null): WaiverKind | null {
  if (ageOnHike === null) return null;
  return ageOnHike < 18 ? "minor" : "adult";
}

/**
 * Путь бланка в хранилище.
 *
 * Плоский, без папок: бланков у клуба ровно два, и раскладывать их некуда.
 * Прежде первым сегментом стоял id похода, и на этом держалась политика
 * бакета — теперь она смотрит только на `bucket_id`, потому что у клубного
 * бланка похода нет.
 *
 * Случайная часть в имени обязательна: без неё новый бланк лёг бы по тому же
 * адресу, что и старый, и у тех, кто уже открывал страницу, остался бы в
 * кэше браузера прежний файл.
 */
export function waiverPath(
  kind: WaiverKind,
  fileId: string,
  fileName: string,
): string {
  return `${kind}-${fileId}${waiverExtension(fileName)}`;
}

const ALLOWED = [".pdf", ".doc", ".docx"];

/** Не больше десяти мегабайт: бланк — это текст, а не скан альбома. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Что не так с выбранным файлом, или null, если всё в порядке.
 *
 * Проверяется расширение, а не MIME-тип: у .docx он приезжает пустым в
 * половине браузеров, и отказ по нему выглядел бы для лидера случайным.
 */
export function waiverFileProblem(file: {
  name: string;
  size: number;
}): string | null {
  const ext = waiverExtension(file.name);
  if (!ALLOWED.includes(ext)) {
    return `${file.name}: нужен PDF или документ Word, а не ${ext || "файл без расширения"}`;
  }
  if (file.size > MAX_BYTES) {
    return `${file.name}: больше 10 МБ. Бланк — это текст, сохрани его в PDF`;
  }
  return null;
}

function waiverExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}
