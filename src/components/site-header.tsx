import Link from "@/components/link";

import { AccountMenu } from "@/components/account-menu";
import { LanguageSelect } from "@/components/language-select";
import { LogoMark } from "@/components/logo";
import { NavProgress } from "@/components/nav-progress";
import { buttonClass } from "@/components/ui";

import { getDictionary } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/server";
import { getCurrentProfile } from "@/lib/profile";

/**
 * Шапка: слева знак с названием, справа язык и вход или аккаунт.
 *
 * «Походы» отсюда убраны намеренно. У авторизованного главная и есть лента
 * походов, то есть ссылка вела туда, где он уже стоит, — лишний шум. Гостю
 * она нужна, но ему её показывает плавающая кнопка внизу экрана, ближе к
 * пальцу. Разбор — в docs/DESIGN.md §5a.
 *
 * Закреплена сверху не только ради удобства: меню аккаунта позиционируется
 * от верха окна, и пока шапка уезжала при прокрутке, открыть его было можно
 * только с самого верха страницы.
 */
export async function SiteHeader() {
  const [profile, locale] = await Promise.all([getCurrentProfile(), getLocale()]);
  const t = getDictionary(locale);

  // Шапка выше, чем цель нажатия: при h-tap кнопка ростом в те же 44px
  // упиралась в обе границы и выглядела вбитой в щель. 44 — это минимум под
  // палец, уменьшать её нельзя, значит расти должна шапка.
  return (
    /* relative — под полоску перехода: она живёт на нижней границе шапки,
       единственном элементе, который всегда на экране. */
    <header className="sticky top-0 z-40 border-b border-line bg-bg relative">
      <NavProgress />
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-6">
        <Link
          href="/"
          className="mr-auto flex h-tap shrink-0 items-center gap-2 font-display text-lg font-bold tracking-tight text-fg"
        >
          {/* Задаём высоту, ширина считается сама: знак вдвое шире, чем выше,
              и квадратный размер оставил бы пустые поля по бокам. */}
          <LogoMark className="h-6 w-auto shrink-0" />
          Step&nbsp;Up
        </Link>

        {/* Язык — у всех, и у гостя: ему меню не показывается, а выбирать
            язык нужно в первые секунды, а не после входа. */}
        <LanguageSelect locale={locale} label={t.header.language} />

        {profile ? (
          <AccountMenu
            fullName={profile.fullName}
            avatarUrl={profile.avatarUrl}
            role={profile.role}
            membershipStatus={profile.membershipStatus}
            t={t.menu}
          />
        ) : (
          /* Кнопка, а не подчёркнутая ссылка того же веса, что и всё вокруг, и
             яркая: вход — главная дорога на сайт. Но обводкой, а не заливкой:
             залитая, она стояла на лендинге прямо над главной кнопкой героя, и
             первый экран предлагал два главных действия сразу. UI.md §5. */
          <Link
            href="/login"
            className={buttonClass({ variant: "accent-outline", size: "sm" })}
          >
            {t.header.signIn}
          </Link>
        )}
      </div>
    </header>
  );
}
