"use client";

import Link from "@/components/link";
import { useSyncExternalStore } from "react";

import { signOut } from "@/app/actions/auth";
import { Chip } from "@/components/chip";
import {
  closeOnBackdrop,
  SHEET_BODY_CLASS,
  SHEET_DIALOG_CLASS,
  SheetHandle,
  useSheet,
} from "@/components/sheet";
import { buttonClass, type ChipTone } from "@/components/ui";
import type { MembershipStatus, UserRole } from "@/lib/profile";
import {
  readThemeChoice,
  setThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";
// fill — из своего модуля, а словарь — только типом: импорт из dictionary.ts
// утащил бы в клиентский бандл тексты всего сайта на трёх языках.
import type { Dictionary } from "@/lib/i18n/dictionary";
import { fill } from "@/lib/i18n/fill";

/**
 * Меню аккаунта в шапке.
 *
 * Появилось потому, что на 390px в шапке помещаются три цели по 44px, а целей
 * было пять: логотип, походы, управление, имя и «выйти» — все одного веса и
 * одного цвета. Разбор в docs/DESIGN.md §5a.
 *
 * На телефоне — шторкой снизу, на компьютере — выпадающим от аватара
 * (решение автора, 14 сентября 2026). До правого верхнего угла большим
 * пальцем не дотянуться, а шторка открывается там, где палец и так. Мышке
 * до угла тянуться не трудно, и там шторка на весь низ экрана была бы
 * лишним движением глаз.
 *
 * Устройство шторки — модальный <dialog>, свайп, блокировка страницы —
 * в components/sheet.tsx, общее с выбором языка.
 */
export function AccountMenu({
  fullName,
  avatarUrl,
  role,
  membershipStatus,
  t,
}: {
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  membershipStatus: MembershipStatus;
  /** Кусок словаря, а не весь: компонент клиентский, лишнее уехало бы в бандл. */
  t: Dictionary["menu"];
}) {
  const { dialog, sheet, open } = useSheet();

  const isStaff = role === "leader" || role === "admin";

  const name = fullName.trim().split(/\s+/)[0] || fullName;
  const initial = (name[0] ?? "?").toUpperCase();
  const status = statusChip(role, membershipStatus, t.status);

  return (
    <>
      <button
        type="button"
        onClick={() => open()}
        aria-haspopup="dialog"
        aria-label={fill(t.open, { name })}
        className="flex size-tap shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        {avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             аватар сжат до 640px при загрузке. */
          <img src={avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          initial
        )}
      </button>

      <dialog
        ref={dialog}
        aria-label={t.dialogLabel}
        onClick={closeOnBackdrop}
        // На компьютере — под аватаром. Модальный диалог живёт в верхнем
        // слое, `position: absolute` внутри шапки там не работает. `sm:right`
        // повторяет геометрию контейнера шапки (`max-w-3xl` = 48rem плюс
        // `px-6`), `sm:top` — высоту шапки (`h-14`) плюс просвет. Менять
        // вместе с шапкой.
        className={`${SHEET_DIALOG_CLASS} sm:top-16 sm:right-[max(1.5rem,calc((100vw-48rem)/2+1.5rem))] sm:w-72`}
      >
      <div
        ref={sheet}
        // Ссылка на ту же страницу, где стоишь, адрес не меняет, и эффект по
        // pathname меню не закрыл бы — оно висело бы открытым, а страница
        // оставалась заблокированной. Закрываем по любому нажатию на ссылку.
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) dialog.current?.close();
        }}
        tabIndex={-1}
        autoFocus
        className={SHEET_BODY_CLASS}
      >
        <SheetHandle />

        {/*
         * Карточка человека вместо серого имени: меню — «твоё», и это видно
         * сразу. Нажатие ведёт в профиль, поэтому отдельного пункта
         * «Профиль» больше нет.
         */}
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-2xl p-3 hover:bg-surface"
        >
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-lg font-semibold">
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element --
                 аватар сжат до 640px при загрузке. */
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{fullName}</span>
            <span className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
              <Chip tone={status.tone}>{status.label}</Chip>
              {t.profile}
            </span>
          </span>
          <Chevron />
        </Link>

        {/*
         * Управление — плиткой и первым: у лидера это основное действие на
         * сайте, и строка с оранжевой точкой среди прочих его прятала.
         */}
        {isStaff && (
          <Link
            href="/admin"
            className="mt-1 flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-3 hover:bg-line"
          >
            <IconBox>
              {/* Цветом текста на заливке, а не серым, как в строках меню:
                  серая на синем пропадала целиком (скриншот автора,
                  15 сентября 2026), да и на оранжевом читалась слабо. */}
              <Icon name="admin" className="text-on-accent" />
            </IconBox>
            <span className="flex-1 font-semibold">{t.admin}</span>
            <Chevron />
          </Link>
        )}

        <Group title={t.groups.hikes}>
          {/* «Все походы» — потому что из шапки ссылка ушла. Нужна с глубоких
              страниц вроде снаряжения, откуда до ленты иначе два шага. */}
          <MenuLink href="/hikes" icon="hikes">
            {t.links.allHikes}
          </MenuLink>
          <MenuLink href="/team" icon="team">
            {t.links.team}
          </MenuLink>
        </Group>

        <Group title={t.groups.mine}>
          <MenuLink href="/profile/gear" icon="gear">
            {t.links.gear}
          </MenuLink>
        </Group>

        {/* Правила и «что взять» раньше были только в подвале — почти
            невидимы, хотя это самые пересылаемые ссылки после похода. */}
        <Group title={t.groups.club}>
          <MenuLink href="/rules" icon="rules">
            {t.links.rules}
          </MenuLink>
          <MenuLink href="/gear-guide" icon="guide">
            {t.links.gearGuide}
          </MenuLink>
        </Group>

        {/* Языка здесь нет: он в шапке, у всех — гостю меню не показывается,
            а выбирать язык нужно раньше входа (решение автора, 15 сентября 2026). */}
        <ThemeSwitch t={t} />

        <div className="my-2 border-t border-line" />

        {/* Выход тише остального: раньше он выглядел ровно как вход в профиль. */}
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-tap w-full items-center gap-3 rounded-xl px-3 text-sm text-fg-muted hover:bg-surface hover:text-fg"
          >
            <Icon name="logout" />
            {t.signOut}
          </button>
        </form>
      </div>
      </dialog>
    </>
  );
}


function statusChip(
  role: UserRole,
  membership: MembershipStatus,
  labels: Dictionary["menu"]["status"],
): { label: string; tone: ChipTone } {
  if (role === "admin") return { label: labels.admin, tone: "accent" };
  if (role === "leader") return { label: labels.leader, tone: "accent" };
  switch (membership) {
    case "member":
      return { label: labels.member, tone: "success" };
    case "pending":
      return { label: labels.pending, tone: "warning" };
    case "alumni":
      return { label: labels.alumni, tone: "neutral" };
    default:
      return { label: labels.guest, tone: "neutral" };
  }
}

// «Авто», а не «Системная»: в выпадающем меню на компьютере (w-72) три
// кнопки с «Системной» были шире строки на 32px и вылезали за край.
// Полное название — в aria-label, для читалки экрана.
function themeOptions(t: Dictionary["menu"]["theme"]): [ThemeChoice, string, string][] {
  return [
    ["system", t.system, t.systemFull],
    ["light", t.light, t.light],
    ["dark", t.dark, t.dark],
  ];
}

/**
 * Выбор темы. Три кнопки, а не тумблер «светлая/тёмная»: выбрав тему руками,
 * иначе нельзя было бы вернуться к системной — сайт перестал бы следовать за
 * телефоном навсегда.
 *
 * Только в меню аккаунта: у гостя меню нет, и ему достаётся системная. Место
 * в шапке на 390px занято (DESIGN.md §5a), а гостю, который пришёл посмотреть
 * походы, выбор темы не нужен.
 */
function ThemeSwitch({ t }: { t: Dictionary["menu"] }) {
  // На сервере выбора не знаем — отрисуем «Системная», и после гидратации
  // useSyncExternalStore сам перерисует на настоящий. Сама тема к этому
  // моменту уже стоит: её ставит скрипт до отрисовки.
  const choice = useSyncExternalStore(
    subscribeThemeChoice,
    readThemeChoice,
    () => "system" as const,
  );

  return (
    <Group title={t.groups.theme}>
      <div role="radiogroup" aria-label={t.groups.theme} className="flex gap-1">
        {themeOptions(t.theme).map(([value, label, fullLabel]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            aria-label={fullLabel}
            onClick={() => setThemeChoice(value)}
            className={buttonClass({
              variant: "ghost",
              size: "sm",
              selected: choice === value,
              className: "flex-1 px-2",
            })}
          >
            {label}
          </button>
        ))}
      </div>
    </Group>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      {/* Тихая подпись вместо голого разделителя: группа называет себя. */}
      <p className="px-3 pb-1 text-xs font-semibold text-fg-muted">{title}</p>
      {children}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-tap items-center gap-3 rounded-xl px-3 text-fg hover:bg-surface"
    >
      <Icon name={icon} />
      {children}
    </Link>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-on-accent">
      {children}
    </span>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0 text-fg-muted"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

type IconName = "admin" | "hikes" | "team" | "gear" | "rules" | "guide" | "logout";

/** Линейные иконки одного веса — рисуем сами, без библиотеки. */
const ICON_PATHS: Record<IconName, string[]> = {
  // Три ползунка — «настройки клуба».
  admin: ["M4 6h10", "M18 6h2", "M4 12h4", "M12 12h8", "M4 18h12", "M16 4v4", "M10 10v4", "M18 16v4"],
  hikes: ["m3 20 6-11 4 6 3-4 5 9z", "M9 9 7.5 6.5"],
  team: ["M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M22 20v-1a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  gear: ["M6 8a6 6 0 0 1 12 0v12H6z", "M9 20v-5h6v5", "M10 4V2h4v2"],
  rules: ["M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z", "m9 12 2 2 4-4"],
  guide: ["M9 6h11", "M9 12h11", "M9 18h11", "m3 6 1 1 2-2", "m3 12 1 1 2-2", "m3 18 1 1 2-2"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
};

function Icon({
  name,
  className = "text-fg-muted",
}: {
  name: IconName;
  /** Цвет — целиком заменяет серый по умолчанию, а не дописывается к нему. */
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 shrink-0 ${className}`}
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
