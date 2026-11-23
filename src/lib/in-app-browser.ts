/**
 * Открыта ли страница во встроенном браузере приложения (WhatsApp и подобные).
 *
 * Зачем: ссылка на поход приходит в группу WhatsApp, и по нажатию открывается
 * не браузер, а WebView внутри мессенджера. Google в таком окружении отвечает
 * `disallowed_useragent` и вход через него не работает вовсе. Это основной
 * путь входа новичка, поэтому определяем ситуацию заранее и показываем, что
 * делать.
 *
 * Проверка по user-agent — эвристика, и она обязана ошибаться в безопасную
 * сторону: вход по magic link показывается всегда, независимо от результата.
 * Ложное срабатывание стоит лишнего баннера, пропуск — упирается в magic link.
 *
 * Проверять только на настоящем телефоне: в эмуляторе user-agent другой.
 */
export function isInAppBrowser(userAgent: string): boolean {
  const ua = userAgent;

  // Android WebView помечает себя токеном wv.
  if (/;\s*wv[;)]/.test(ua)) return true;

  // Явные метки известных приложений.
  if (/(FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|GSA\/)/i.test(ua)) {
    return true;
  }

  // iOS: WKWebView внутри приложения не добавляет в user-agent токен Safari,
  // тогда как настоящий Safari его ставит всегда.
  if (/\b(iPhone|iPad|iPod)\b/.test(ua) && !/Safari\//.test(ua)) return true;

  return false;
}
