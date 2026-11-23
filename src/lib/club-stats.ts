import { unstable_cache } from "next/cache";
import { cache } from "react";

import { LANDING_STATS_TAG } from "@/lib/cache-tags";
import { createPublicClient } from "@/lib/supabase/public";

export type ClubStats = {
  hikesCompleted: number;
  membersCount: number;
  totalElevationM: number;
  routesCount: number;
};

/**
 * Пять минут, а не только метка сброса.
 *
 * Метка тут бессильна: hikes_completed считает и походы со статусом
 * published, у которых starts_at уже позади, — то есть число меняется само от
 * хода времени, без действия, к которому можно прицепить сброс. Цифру на
 * витрине никто не сверяет по секундам, а на наплыве пять минут снимают
 * почти все запросы.
 */
const STATS_TTL_SECONDS = 300;

/**
 * Цифры клуба для лендинга.
 *
 * Через витрину public_club_stats: анониму нужны эти числа, но таблицы, из
 * которых они считаются, ему закрыты политиками — и правильно.
 *
 * Считается один раз на всех, а не заново на каждого гостя: цифры у всех
 * одинаковые, а лендинг — та страница, которую открывают толпой по ссылке из
 * чата.
 */
const loadClubStats = unstable_cache(
  async function loadClubStats(): Promise<ClubStats> {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("public_club_stats")
      .select("hikes_completed, members_count, total_elevation_m, routes_count")
      .maybeSingle<{
        hikes_completed: number;
        members_count: number;
        total_elevation_m: number;
        routes_count: number;
      }>();

    // Нули — это блок «клуб только начинается», а не поломка. Держать такой
    // ответ пять минут не жалко: он и так означает, что база не отвечает, и
    // долбить её каждым заходом незачем.
    if (error || !data) {
      if (error) console.error("Не удалось получить цифры клуба", error);
      return {
        hikesCompleted: 0,
        membersCount: 0,
        totalElevationM: 0,
        routesCount: 0,
      };
    }

    return {
      hikesCompleted: data.hikes_completed,
      membersCount: data.members_count,
      totalElevationM: data.total_elevation_m,
      routesCount: data.routes_count,
    };
  },
  ["club-stats"],
  { tags: [LANDING_STATS_TAG], revalidate: STATS_TTL_SECONDS },
);

export const getClubStats = cache(loadClubStats);

export type PublicLeader = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  /** Подпись под фото: «Основатель», «SMM». На права не влияет. */
  clubTitle: string | null;
  /** Ник без @; ссылка собирается в компоненте. */
  instagram: string | null;
};

/**
 * Блок «кто ведёт» намеренно НЕ кэшируется между запросами, в отличие от
 * соседей по лендингу.
 *
 * Так было не сразу. 30 августа 2026 автор поменял лидеру `club_title`,
 * увидел изменение в базе и не увидел на лендинге. Причина: единственная
 * метка сброса висела на сохранении профиля через сайт, а `club_title` и
 * `team_order` заполняются руками в SQL — то есть кэш не видел ни одного
 * пути правки, которым эти данные реально меняют.
 *
 * Отсюда правило шире этого места: **кэш с ручным сбросом бесполезен перед
 * данными, которые правят мимо приложения.** Метка сбрасывается кодом, а
 * если кода в этом пути нет, сбрасывать её некому — остаётся только срок, и
 * он превращается в необъяснимое «в базе одно, на экране другое».
 *
 * Цена отказа мала: это один запрос из восьми на лендинге, и только у гостя.
 * Путаница стоила дороже.
 */
const loadPublicLeaders = cache(
  async function loadPublicLeaders(): Promise<PublicLeader[]> {
    const supabase = createPublicClient();
    // Только вписанные руками, по возрастанию team_order.
    //
    // Витрина показывает всех с ролью leader или admin — и на лендинг так
    // попал тестовый профиль. Отбор по «кого вписали» отсеивает и тестовые
    // учётки, и бывших лидеров, которым роль забыли снять. Фильтр стоит
    // здесь, а не в самой витрине: её же читает карточка похода, чтобы
    // показать, кто ведёт, и там нужны все.
    const { data, error } = await supabase
      .from("public_leaders")
      .select("id, full_name, avatar_url, bio, club_title, team_order, instagram")
      .not("team_order", "is", null)
      .order("team_order", { ascending: true })
      .returns<
        {
          id: string;
          full_name: string;
          avatar_url: string | null;
          bio: string | null;
          club_title: string | null;
          instagram: string | null;
        }[]
      >();

    if (error) {
      console.error("Не удалось получить лидеров", error);
      return [];
    }
    return data.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      clubTitle: row.club_title,
      instagram: row.instagram,
    }));
  },
);

export const listPublicLeaders = loadPublicLeaders;
