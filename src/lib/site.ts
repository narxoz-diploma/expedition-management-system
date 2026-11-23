import { headers } from "next/headers";

/**
 * Инстаграм клуба.
 *
 * Ссылкой, а не встройкой: официальный эмбед тянет свой скрипт, следит за
 * посетителем, не красится в тёмную тему и возвращает часть той задержки,
 * которую лечили в docs/PERF.md.
 */
export const INSTAGRAM_URL = "https://www.instagram.com/narxozstepup/";
export const INSTAGRAM_HANDLE = "@narxozstepup";

/**
 * Публичный адрес сайта для ссылок, которые уйдут наружу — в анонс для
 * WhatsApp прежде всего.
 *
 * Берётся из заголовков запроса, а не из переменной окружения: адрес
 * превью-деплоя на Vercel свой у каждой ветки, и захардкоженный адрес
 * прода отправил бы лидера проверять анонс не на том сайте.
 */
export async function getSiteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
