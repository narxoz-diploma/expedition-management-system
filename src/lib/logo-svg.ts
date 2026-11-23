/**
 * Знак Step Up одной строкой разметки.
 *
 * Единственный источник контуров для интерфейса: его подключает компонент
 * LogoMark в шапке и он же уходит в картинку превью для мессенджеров, где
 * нужен именно data-URI, а не React-компонент.
 *
 * Отдельно существует src/app/icon.svg — фавикон. Это не копия: у него другой
 * viewBox, кадрированный под квадрат, потому что знак вдвое шире, чем выше,
 * и целиком в фавиконе превращается в нечитаемую полоску.
 *
 * Идентификаторы градиентов с префиксом su-: в SVG они общие на весь
 * документ, и без префикса чужой градиент с именем «g4» перекрасил бы гору.
 */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="58 16 1530 776" role="img" aria-label="Step Up">
<defs>
<linearGradient id="su-g9" gradientUnits="userSpaceOnUse" x1="278" y1="617" x2="278" y2="787"><stop offset="0" stop-color="rgb(211,14,18)"/><stop offset="1" stop-color="rgb(206,5,22)"/></linearGradient>
<linearGradient id="su-g8" gradientUnits="userSpaceOnUse" x1="656" y1="441" x2="656" y2="787"><stop offset="0" stop-color="rgb(244,50,1)"/><stop offset="1" stop-color="rgb(222,11,14)"/></linearGradient>
<linearGradient id="su-g7" gradientUnits="userSpaceOnUse" x1="464" y1="433" x2="464" y2="577"><stop offset="0" stop-color="rgb(241,46,2)"/><stop offset="1" stop-color="rgb(234,17,4)"/></linearGradient>
<linearGradient id="su-g6" gradientUnits="userSpaceOnUse" x1="894" y1="264" x2="894" y2="787"><stop offset="0" stop-color="rgb(252,124,1)"/><stop offset="1" stop-color="rgb(244,39,1)"/></linearGradient>
<linearGradient id="su-g5" gradientUnits="userSpaceOnUse" x1="643" y1="253" x2="643" y2="393"><stop offset="0" stop-color="rgb(251,123,2)"/><stop offset="1" stop-color="rgb(248,91,2)"/></linearGradient>
<linearGradient id="su-g4" gradientUnits="userSpaceOnUse" x1="1219" y1="230" x2="1219" y2="787"><stop offset="0" stop-color="rgb(252,216,46)"/><stop offset="1" stop-color="rgb(249,91,35)"/></linearGradient>
<linearGradient id="su-g2" gradientUnits="userSpaceOnUse" x1="889" y1="33" x2="889" y2="492"><stop offset="0" stop-color="rgb(241,145,2)"/><stop offset="1" stop-color="rgb(227,69,12)"/></linearGradient>
<linearGradient id="su-g3" gradientUnits="userSpaceOnUse" x1="1005" y1="33" x2="1005" y2="296"><stop offset="0" stop-color="rgb(253,243,189)"/><stop offset="1" stop-color="rgb(253,243,188)"/></linearGradient>
</defs>
<path d="M 58.4,791.0 L 441.0,792.0 L 441.0,612.0 L 178.4,612.0 L 58.4,791.0 Z" fill="url(#su-g9)"/>
<path d="M 439.0,612.0 L 439.0,792.0 L 959.2,792.0 L 596.0,427.7 L 596.0,611.0 L 439.0,612.0 Z" fill="url(#su-g8)"/>
<path d="M 285.6,581.0 L 598.0,582.0 L 598.0,428.0 L 380.3,428.0 L 285.6,581.0 Z" fill="url(#su-g7)"/>
<path d="M 594.8,428.0 L 956.8,792.0 L 1192.2,792.0 L 763.0,248.4 L 763.0,427.0 L 594.8,428.0 Z" fill="url(#su-g6)"/>
<path d="M 476.6,398.0 L 765.0,398.0 L 765.0,249.0 L 569.3,248.0 L 476.6,398.0 Z" fill="url(#su-g5)"/>
<path d="M 925.3,281.5 L 971.6,362.2 L 948.6,413.3 L 975.7,451.5 L 959.7,503.6 L 1189.6,790.0 L 1588.7,792.0 L 1219.0,252.7 L 1173.8,318.0 L 1128.0,260.7 L 1064.3,225.6 L 1040.0,301.3 L 984.4,220.3 L 925.3,281.5 Z" fill="url(#su-g4)"/>
<path d="M 957.9,17.7 L 764.2,251.9 L 960.0,504.1 L 978.3,453.6 L 950.5,411.8 L 974.4,364.9 L 919.3,270.7 L 959.0,164.5 L 957.9,17.7 Z" fill="url(#su-g2)"/>
<path d="M 955.9,16.5 L 957.0,166.4 L 936.2,212.9 L 917.7,270.4 L 925.5,282.8 L 983.3,223.0 L 985.4,223.0 L 1039.9,308.0 L 1064.8,229.3 L 1130.6,263.3 L 955.9,16.5 Z" fill="url(#su-g3)"/>
</svg>`;


/**
 * Второй вариант знака — синий. Тот же контур, другие цвета: он на аватарке
 * клуба в инстаграме и WhatsApp и на флаге. Нарисован под светлый фон, как
 * оранжевый — под тёмный (решение автора, 15 сентября 2026).
 *
 * Префикс градиентов свой, sub-: на странице бывают оба знака сразу, и с
 * общими идентификаторами один перекрасил бы другой.
 */
export const LOGO_SVG_BLUE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="58 16 1530 776" role="img" aria-label="Step Up">
<defs>
<linearGradient id="sub-g9" gradientUnits="userSpaceOnUse" x1="278" y1="617" x2="278" y2="787"><stop offset="0" stop-color="rgb(20,54,102)"/><stop offset="1" stop-color="rgb(14,40,84)"/></linearGradient>
<linearGradient id="sub-g8" gradientUnits="userSpaceOnUse" x1="656" y1="441" x2="656" y2="787"><stop offset="0" stop-color="rgb(16,90,140)"/><stop offset="1" stop-color="rgb(14,60,110)"/></linearGradient>
<linearGradient id="sub-g7" gradientUnits="userSpaceOnUse" x1="464" y1="433" x2="464" y2="577"><stop offset="0" stop-color="rgb(16,110,160)"/><stop offset="1" stop-color="rgb(14,90,140)"/></linearGradient>
<linearGradient id="sub-g6" gradientUnits="userSpaceOnUse" x1="894" y1="264" x2="894" y2="787"><stop offset="0" stop-color="rgb(24,150,190)"/><stop offset="1" stop-color="rgb(16,120,170)"/></linearGradient>
<linearGradient id="sub-g5" gradientUnits="userSpaceOnUse" x1="643" y1="253" x2="643" y2="393"><stop offset="0" stop-color="rgb(40,170,205)"/><stop offset="1" stop-color="rgb(24,150,190)"/></linearGradient>
<linearGradient id="sub-g4" gradientUnits="userSpaceOnUse" x1="1219" y1="230" x2="1219" y2="787"><stop offset="0" stop-color="rgb(150,215,230)"/><stop offset="1" stop-color="rgb(40,170,205)"/></linearGradient>
<linearGradient id="sub-g2" gradientUnits="userSpaceOnUse" x1="889" y1="33" x2="889" y2="492"><stop offset="0" stop-color="rgb(30,90,150)"/><stop offset="1" stop-color="rgb(16,60,120)"/></linearGradient>
<linearGradient id="sub-g3" gradientUnits="userSpaceOnUse" x1="1005" y1="33" x2="1005" y2="296"><stop offset="0" stop-color="rgb(245,251,253)"/><stop offset="1" stop-color="rgb(230,245,250)"/></linearGradient>
</defs>
<path d="M 58.4,791.0 L 441.0,792.0 L 441.0,612.0 L 178.4,612.0 L 58.4,791.0 Z" fill="url(#sub-g9)"/>
<path d="M 439.0,612.0 L 439.0,792.0 L 959.2,792.0 L 596.0,427.7 L 596.0,611.0 L 439.0,612.0 Z" fill="url(#sub-g8)"/>
<path d="M 285.6,581.0 L 598.0,582.0 L 598.0,428.0 L 380.3,428.0 L 285.6,581.0 Z" fill="url(#sub-g7)"/>
<path d="M 594.8,428.0 L 956.8,792.0 L 1192.2,792.0 L 763.0,248.4 L 763.0,427.0 L 594.8,428.0 Z" fill="url(#sub-g6)"/>
<path d="M 476.6,398.0 L 765.0,398.0 L 765.0,249.0 L 569.3,248.0 L 476.6,398.0 Z" fill="url(#sub-g5)"/>
<path d="M 925.3,281.5 L 971.6,362.2 L 948.6,413.3 L 975.7,451.5 L 959.7,503.6 L 1189.6,790.0 L 1588.7,792.0 L 1219.0,252.7 L 1173.8,318.0 L 1128.0,260.7 L 1064.3,225.6 L 1040.0,301.3 L 984.4,220.3 L 925.3,281.5 Z" fill="url(#sub-g4)"/>
<path d="M 957.9,17.7 L 764.2,251.9 L 960.0,504.1 L 978.3,453.6 L 950.5,411.8 L 974.4,364.9 L 919.3,270.7 L 959.0,164.5 L 957.9,17.7 Z" fill="url(#sub-g2)"/>
<path d="M 955.9,16.5 L 957.0,166.4 L 936.2,212.9 L 917.7,270.4 L 925.5,282.8 L 983.3,223.0 L 985.4,223.0 L 1039.9,308.0 L 1064.8,229.3 L 1130.6,263.3 L 955.9,16.5 Z" fill="url(#sub-g3)"/>
</svg>`;

/** Тот же знак в виде data-URI — для картинок превью, куда React не завезти. */
export const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;
