import Link from "@/components/link";

import { CategoryScale } from "@/components/category-scale";
import { HeroPhotos } from "@/components/hero-photos";
import { HikeCard } from "@/components/hike-card";
import { buttonClass } from "@/components/ui";
import type { ClubStats, PublicLeader } from "@/lib/club-stats";
import { formatInteger, NBSP, pluralize } from "@/lib/hikes/format";
import type { Hike } from "@/lib/hikes/types";
import { fill, getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
import type { HikePhoto } from "@/lib/photos/queries";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";

type LandingText = Dictionary["landing"];

/**
 * Лендинг для гостя.
 *
 * Порядок блоков из SCREENS.md важен: он снимает страхи новичка по очереди —
 * сначала что это, потом что клуб живой, потом что можно без подготовки.
 *
 * Блоки без содержимого не показываются вовсе. Пустая «галерея» или счётчик
 * «0 походов» работают против доверия сильнее, чем их отсутствие.
 */
export async function Landing({
  stats,
  leaders,
  upcoming,
  heroPhotos,
  gallery,
  covers,
}: {
  stats: ClubStats;
  leaders: PublicLeader[];
  upcoming: Hike[];
  heroPhotos: HikePhoto[];
  gallery: HikePhoto[];
  covers: Map<string, HikePhoto>;
}) {
  const locale = await getLocale();
  const t = getDictionary(locale).landing;

  return (
    <main>
      <Hero photos={heroPhotos} t={t.hero} />
      <Numbers stats={stats} t={t.numbers} locale={locale} />
      <ForWhom t={t.forWhom} />
      <Gallery photos={gallery} t={t.gallery} />
      <Categories t={t.categories} />
      <Safety t={t.safety} />
      <Leaders leaders={leaders} t={t.team} />
      <Upcoming hikes={upcoming} covers={covers} t={t.upcoming} />
      <Join t={t.join} />
    </main>
  );
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-b border-line ${className}`}>
      <div className="mx-auto w-full max-w-3xl px-6 py-14">{children}</div>
    </section>
  );
}

function Hero({ photos, t }: { photos: HikePhoto[]; t: LandingText["hero"] }) {
  const hasPhoto = photos.length > 0;

  return (
    <section className="relative border-b border-line">
      {/* Фото с настоящего похода — по DESIGN.md это первое, что видит
          человек. Кадры выбирают лидеры кнопкой «На главную» у себя на
          походе; не отмечено ничего — берётся обложка последнего похода;
          нет и её — остаётся градиент в цветах логотипа, он честнее
          заглушки с чужим стоком.

          Снимки — фоном, а не <img>: текст поверх них, и это оформление, а
          не содержание. alt тут был бы шумом для читалки экрана. */}
      <HeroPhotos photos={photos} />

      {/* Затемнение поверх фото: заголовок белым по горному снимку без него
          читается через раз — на снегу и небе он пропадает целиком. */}
      <div
        className={
          hasPhoto
            ? "relative bg-linear-to-b from-bg/80 via-bg/70 to-bg/90"
            : "bg-linear-to-b from-accent-900/40 to-transparent"
        }
      >
        <div className="mx-auto w-full max-w-3xl px-6 pt-20 pb-16">
          <p className="text-sm font-medium tracking-widest text-fg-muted uppercase">
            {t.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl leading-tight font-bold sm:text-5xl">{t.title}</h1>
          <p className="mt-5 max-w-xl text-lg text-fg-muted">{t.lead}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {/* data-cta-anchor: пока эта кнопка на экране, плавающая внизу
                прячется — две одинаковые разом выглядят как ошибка. */}
            <Link
              href="/hikes"
              data-cta-anchor
              className={buttonClass({ variant: "primary", className: "px-6" })}
            >
              {t.ctaHikes}
            </Link>
            <Link
              href="/gear-guide"
              className={buttonClass({ className: "px-6" })}
            >
              {t.ctaGear}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Галерея — по SCREENS.md §4: «люди, а не только пейзажи, новичок должен
 * увидеть таких же, как он». Стоит после «Для кого» намеренно: сначала ему
 * говорят, что подготовка не нужна, и сразу показывают, кто ходит.
 *
 * Пустого блока не бывает: заголовок «Как это выглядит» над пустотой
 * работает против доверия сильнее, чем отсутствие галереи.
 */
function Gallery({ photos, t }: { photos: HikePhoto[]; t: LandingText["gallery"] }) {
  if (photos.length === 0) return null;

  return (
    <Section>
      <h2 className="text-2xl font-bold sm:text-3xl">{t.title}</h2>
      {/* Каруселью, а не сеткой: тринадцать снимков в две колонки занимали
          три с лишним экрана, и до «Для кого» и категорий доходил не каждый
          (предложение автора, 13 сентября 2026). Нативная прокрутка со
          «щелчком», без библиотеки: свайп, инерция и доступность — у
          браузера. Следующий кадр выглядывает справа — видно, что листается. */}
      <ul
        aria-label={t.label}
        /* Полоса прокрутки спрятана: листается пальцем, а о том, что есть
           ещё, говорит выглядывающий справа кадр. Серая полоса под фото
           читалась как линия-разделитель. */
        className="-mx-6 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo) => (
          <li key={photo.id} className="w-4/5 shrink-0 snap-start sm:w-2/5">
            <a
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element --
                  снимки сжаты при загрузке, см. photo-grid.tsx. */}
              <img
                src={photo.thumbUrl}
                alt=""
                loading="lazy"
                className="aspect-4/3 w-full object-cover"
              />
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-2">
        <Link
          href="/hikes?tab=past"
          className="inline-flex h-tap items-center text-accent-500 underline underline-offset-4"
        >
          {t.pastLink}
        </Link>

        {/*
          Раньше строка про инстаграм стояла в блоке «Как попасть в клуб», и
          комментарий рядом объяснял: живых фотографий на сайте нет,
          фотоальбомы стоят в третьей фазе, а показать, что клуб настоящий,
          надо сейчас. Фотографии появились, и объяснение перестало быть
          правдой — а сама лента осталась полезной, но уже как продолжение
          галереи, а не как замена ей. Отсюда и переезд.
        */}
        <p className="text-fg-muted">
          {t.more}{" "}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent-500 underline underline-offset-4"
          >
            {INSTAGRAM_HANDLE}
          </a>
        </p>
      </div>
    </Section>
  );
}

function Numbers({
  stats,
  t,
  locale,
}: {
  stats: ClubStats;
  t: LandingText["numbers"];
  locale: Locale;
}) {
  // Пока клуб не провёл ни одного похода через сайт, показывать нули незачем.
  if (stats.hikesCompleted === 0 && stats.membersCount === 0) return null;

  const items = [
    stats.hikesCompleted > 0 && {
      value: String(stats.hikesCompleted),
      label: pluralize(stats.hikesCompleted, t.hikes, locale),
    },
    stats.membersCount > 0 && {
      value: String(stats.membersCount),
      label: pluralize(stats.membersCount, t.members, locale),
    },
    stats.totalElevationM > 0 && {
      value: `${formatInteger(stats.totalElevationM, locale)}${NBSP}${t.meters}`,
      label: t.elevation,
    },
    stats.routesCount > 0 && {
      value: String(stats.routesCount),
      label: pluralize(stats.routesCount, t.routes, locale),
    },
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <Section>
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="sr-only">{item.label}</dt>
            <dd>
              <span className="block font-display text-3xl font-bold text-fg">
                {item.value}
              </span>
              <span className="mt-1 block text-sm text-fg-muted">
                {item.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function ForWhom({ t }: { t: LandingText["forWhom"] }) {
  return (
    <Section>
      <h2 className="text-2xl font-bold sm:text-3xl">{t.title}</h2>
      <p className="mt-3 text-fg-muted">{t.lead}</p>

      <dl className="mt-8 flex flex-col gap-6">
        {t.items.map((item) => (
          <div key={item.q}>
            <dt className="font-semibold text-fg">{item.q}</dt>
            <dd className="mt-2 text-fg-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Categories({ t }: { t: LandingText["categories"] }) {
  return (
    <Section>
      <h2 className="text-2xl font-bold sm:text-3xl">{t.title}</h2>
      {/* Не «начинают с первой»: лидер вправе открыть новичкам поход любой
          категории (решение автора, 14 сентября 2026), и рядом с плашкой
          «Можно новичкам» на третьей категории старый текст был неправдой. */}
      <p className="mt-3 text-fg-muted">{t.lead}</p>

      <ul className="mt-8 flex flex-col gap-5">
        {([1, 2, 3, 4, 5] as const).map((category) => (
          <li key={category} className="flex gap-4">
            <span className="pt-1">
              <CategoryScale category={category} />
            </span>
            <p className="text-fg-muted">
              <span className="font-semibold text-fg">{fill(t.item, { n: category })} </span>
              {t.descriptions[category]}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Safety({ t }: { t: LandingText["safety"] }) {
  return (
    <Section>
      <h2 className="text-2xl font-bold sm:text-3xl">{t.title}</h2>
      <p className="mt-3 text-fg-muted">{t.lead}</p>

      <ul className="mt-6 flex list-disc flex-col gap-3 pl-5 text-fg-muted marker:text-fg-muted">
        {t.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      <Link
        href="/rules"
        className="mt-6 inline-flex h-tap items-center text-accent-500 underline underline-offset-4"
      >
        {t.rulesLink}
      </Link>
    </Section>
  );
}

/**
 * Команда, а не «кто ведёт»: в блоке есть SMM и трэвл-ассистенты, а не
 * только те, кто идёт впереди группы. Подпись под именем чисто
 * информативная — на права в системе она не влияет никак.
 *
 * Крупное фото сверху, подпись снизу: прежний вариант со строкой и
 * кружком-ноготком читался как список контактов, а не как команда клуба.
 *
 * Подпись роли и «о себе» — текст самих людей, показывается как написан на
 * любом языке.
 */
function Leaders({ leaders, t }: { leaders: PublicLeader[]; t: LandingText["team"] }) {
  if (leaders.length === 0) return null;

  return (
    <Section>
      <h2 className="text-2xl font-bold sm:text-3xl">{t.title}</h2>
      {/* Сеткой, а не каруселью: здесь смотрят на лица разом — «людей много,
          клуб настоящий», — а карусель показала бы полтора человека. Шесть
          на главной, остальные на /team (обсуждено с автором, 14 сентября
          2026). */}
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {leaders.slice(0, TEAM_ON_LANDING).map((leader) => (
          <li key={leader.id} className="overflow-hidden rounded-2xl bg-surface">
            {/* Фото берётся из аватара: человек ставит его у себя в профиле,
                отдельного «портрета для лендинга» нет — иначе вторая
                колонка и вопрос «какой из двух показывать» на каждом
                экране. Пока фото нет, квадрат с буквой держит строй сетки. */}
            <div className="aspect-square bg-surface-raised">
              {leader.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element --
                   аватары сжаты до 640px при загрузке. */
                <img
                  src={leader.avatarUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-3xl font-bold text-fg-muted">
                  {leader.fullName.trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="p-3">
              <p className="font-semibold text-fg">{leader.fullName}</p>
              {leader.clubTitle && (
                <p className="mt-1 text-sm text-fg-muted">{leader.clubTitle}</p>
              )}
              {leader.bio && (
                <p className="mt-2 text-sm text-fg-muted">{leader.bio}</p>
              )}
              {leader.instagram && (
                /* Ник хранится без @ и без адреса: собрать ссылку мы умеем
                   сами, а проверить чужую — нет. */
                <a
                  href={`https://instagram.com/${leader.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-accent-500 underline underline-offset-4"
                >
                  @{leader.instagram}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Link href="/team" className={buttonClass({ className: "mt-6" })}>
        {leaders.length > TEAM_ON_LANDING ? fill(t.all, { n: leaders.length }) : t.more}
      </Link>
    </Section>
  );
}

const TEAM_ON_LANDING = 6;

function Upcoming({
  hikes,
  covers,
  t,
}: {
  hikes: Hike[];
  covers: Map<string, HikePhoto>;
  t: LandingText["upcoming"];
}) {
  return (
    <Section>
      <h2 className="text-2xl font-bold sm:text-3xl">{t.title}</h2>

      {/* Без «раз в неделю»: это обещание клуба, а не факт о сайте, и в
          каникулы или сессию оно превращается в ложь на главной странице —
          причём для гостя, который зашёл в первый раз. Комментарий стоит
          здесь, а не внутри ветки: после «? (» идёт выражение, а не разметка,
          и фигурный вариант там — синтаксическая ошибка. */}
      {hikes.length === 0 ? (
        <p className="mt-4 text-fg-muted">{t.empty}</p>
      ) : (
        <>
          <ul className="mt-6 flex flex-col gap-4">
            {hikes.map((hike) => (
              <li key={hike.id}>
                <HikeCard hike={hike} cover={covers.get(hike.id) ?? null} />
              </li>
            ))}
          </ul>
          <Link
            href="/hikes"
            className="mt-6 inline-flex h-tap items-center text-accent-500 underline underline-offset-4"
          >
            {t.allLink}
          </Link>
        </>
      )}
    </Section>
  );
}

function Join({ t }: { t: LandingText["join"] }) {
  return (
    <section>
      <div className="mx-auto w-full max-w-3xl px-6 py-14">
        <h2 className="text-2xl font-bold sm:text-3xl">{t.title}</h2>
        <p className="mt-3 text-fg-muted">{t.lead}</p>

        <Link
          href="/hikes"
          data-cta-anchor
          className={buttonClass({
            variant: "primary",
            block: true,
            className: "mt-6 px-6 sm:w-auto",
          })}
        >
          {t.cta}
        </Link>

        <dl className="mt-12 flex flex-col gap-6">
          {t.faq.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold text-fg">{item.q}</dt>
              <dd className="mt-2 text-fg-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
