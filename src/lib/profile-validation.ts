import { z } from "zod";

// Относительные пути с расширением: этот модуль читает `node --test`, а
// алиас `@/` он не достраивает. Оба соседа — чистые, без импортов приложения.
import { fullNameProblem, normalizeFullName } from "./full-name.ts";
import type { Locale } from "./i18n/locales";
import { normalizePhone } from "./phone.ts";
import { ageOn } from "./profile-age.ts";

const MIN_BIRTH_YEAR = 1940;

type Message =
  | "phoneRequired"
  | "phoneInvalid"
  | "birthDateRequired"
  | "birthDateInvalid"
  | "studyYear"
  | "visitedTooLong"
  | "fitness"
  | "emergencyName"
  | "consent"
  | "minorNeedsParent"
  | "emergencySamePhone";

/*
 * Тексты ошибок — здесь, а не в словаре сайта: модуль гоняют тесты, словарь
 * тянет импорты приложения. Русский — по умолчанию, тесты сверяют его.
 * Казахский не вычитан, см. dictionaries/kk.ts.
 */
const MESSAGES: Record<Locale, Record<Message, string>> = {
  ru: {
    phoneRequired: "Без телефона лидер не сможет связаться",
    // Не «похоже на опечатку»: человек с иностранным номером не ошибался, и
    // такое сообщение отправляло его искать ошибку там, где её нет. Теперь
    // оно говорит, что именно нужно.
    phoneInvalid:
      "Не похоже на номер. Наш — например +7 701 234 56 78. Иностранный — обязательно с кодом страны, начиная с +",
    birthDateRequired: "Укажи дату рождения",
    birthDateInvalid: "Проверь дату рождения",
    studyYear: "Курс от 1 до 4",
    visitedTooLong: "Слишком длинно — лидер читает это с телефона",
    fitness: "Выбери, что ближе к правде",
    emergencyName: "Как зовут этого человека?",
    consent: "Без согласия мы не можем хранить твои данные",
    minorNeedsParent: "Тебе ещё нет 18 — на маршрут нужен контакт родителя или опекуна",
    emergencySamePhone:
      "Это твой номер. Нужен номер другого человека — того, кому позвонят, если что-то случится с тобой",
  },
  en: {
    phoneRequired: "Without a phone number the leader can't reach you",
    phoneInvalid:
      "That doesn't look like a phone number. Local — for example +7 701 234 56 78. Foreign — always with the country code, starting with +",
    birthDateRequired: "Enter your date of birth",
    birthDateInvalid: "Check your date of birth",
    studyYear: "Year of study from 1 to 4",
    visitedTooLong: "Too long — the leader reads this on a phone",
    fitness: "Pick what's closest to the truth",
    emergencyName: "What's this person's name?",
    consent: "Without your consent we can't store your data",
    minorNeedsParent: "You're not 18 yet — the route needs a parent's or guardian's contact",
    emergencySamePhone:
      "That's your own number. We need someone else's — the person we'll call if something happens to you",
  },
  kk: {
    phoneRequired: "Телефонсыз жетекші сенімен байланыса алмайды",
    phoneInvalid:
      "Нөмірге ұқсамайды. Біздікі — мысалы +7 701 234 56 78. Шетелдік — міндетті түрде ел кодымен, + белгісінен бастап",
    birthDateRequired: "Туған күніңді көрсет",
    birthDateInvalid: "Туған күніңді тексер",
    studyYear: "Курс 1-ден 4-ке дейін",
    visitedTooLong: "Тым ұзын — жетекші мұны телефоннан оқиды",
    fitness: "Шындыққа жақынын таңда",
    emergencyName: "Бұл адамның аты кім?",
    consent: "Келісіміңсіз деректеріңді сақтай алмаймыз",
    minorNeedsParent: "Саған әлі 18 толмаған — маршрутқа ата-анаңның немесе қамқоршыңның байланысы керек",
    emergencySamePhone:
      "Бұл өз нөмірің. Басқа адамның нөмірі керек — саған бірдеңе болса, соған хабарласады",
  },
};

/**
 * Схема мини-профиля с сообщениями на языке страницы.
 *
 * Фабрикой, а не одной константой: сообщения zod зашиваются в схему при её
 * создании, и переведённый текст нельзя подставить потом, не разбирая ошибку
 * заново.
 */
export function profileInputSchemaFor(locale: Locale) {
  const t = MESSAGES[locale];

  /** Телефон принимаем в любом виде, храним в одном. */
  const phone = z
    .string()
    .min(1, t.phoneRequired)
    .transform((value, ctx) => {
      const normalized = normalizePhone(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: t.phoneInvalid });
        return z.NEVER;
      }
      return normalized;
    });

  return z
    .object({
      // Имя и фамилия, а не «хоть два символа»: см. lib/full-name.ts.
      fullName: z
        .string()
        .transform(normalizeFullName)
        .superRefine((value, ctx) => {
          const problem = fullNameProblem(value, locale);
          if (problem) ctx.addIssue({ code: "custom", message: problem });
        }),

      phone,

      birthDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, t.birthDateRequired)
        .refine((value) => {
          const year = Number(value.slice(0, 4));
          return year >= MIN_BIRTH_YEAR && new Date(value) < new Date();
        }, t.birthDateInvalid),

      // Бакалавриат в Казахстане четырёхлетний. Магистрант выберет «1», и это
      // будет значить не то же самое — но поле информационное, лидер по нему
      // решений не принимает, так что заводить отдельную «магистратуру» рано.
      studyYear: z.preprocess(
        (value) => (value === "" || value == null ? null : Number(value)),
        z.number().int().min(1, t.studyYear).max(4, t.studyYear).nullable(),
      ),

      // Необязательное и свободное. Пустое поле — это null, а не пустая строка:
      // иначе «не заполнял» и «написал пробел» выглядели бы в базе по-разному,
      // а в ростере — одинаково.
      visitedPlaces: z.preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z
          .string()
          .max(1000, t.visitedTooLong)
          .nullish()
          .transform((value) => value || null),
      ),

      // Обязательное. Иначе заполнит половина, и лидер не отличит «слабый» от
      // «не ответил» — а это, как и со снаряжением, разные действия: одному
      // написать, у другого спросить.
      fitnessLevel: z.preprocess(
        (value) => (value === "" || value == null ? null : Number(value)),
        z.number().int().min(1, t.fitness).max(3, t.fitness),
      ),

      emergencyName: z.string().trim().min(2, t.emergencyName).max(120),

      emergencyPhone: phone,

      // Колонка is_parent существовала с первой миграции, а поставить галочку
      // было негде: у всех живых людей она оставалась false, и «(родитель)» в
      // составе группы и в выгрузке не показывалось ни разу.
      emergencyIsParent: z.preprocess(
        (value) => value === "on" || value === true,
        z.boolean(),
      ),

      // Согласие — не формальность: без него по закону нельзя хранить телефон
      // и дату рождения, а мы храним и то и другое.
      consent: z.preprocess(
        (value) => value === "on" || value === true,
        z.literal(true, { error: t.consent }),
      ),
    })
    /**
     * Несовершеннолетнему контакт обязан быть родительским.
     *
     * Проверка здесь, а не отдельным полем формы: возраст и галочка приезжают
     * вместе, и связать их можно только когда известно и то и другое.
     *
     * Считается на сегодня, а не на дату похода: профиль про поход ничего не
     * знает. Тому, кому исполнится 18 до выхода, галочку останется снять — это
     * дешевле, чем пропустить школьника с контактом одноклассника.
     */
    /**
     * Контакт на случай ЧП — не свой номер.
     *
     * Просьба автора 19 сентября 2026: в поле вписывают себя, чтобы пройти
     * обязательное поле. Такой контакт хуже пустого — лидер с маршрута
     * позвонит человеку, с которым случилась беда, и узнает об этом только
     * тогда. Сравниваются уже приведённые номера: «8 701…» и «+7 701…» —
     * один и тот же. От выдуманного номера это не защищает, от ленивого —
     * да.
     */
    .superRefine((input, ctx) => {
      if (input.phone !== input.emergencyPhone) return;
      ctx.addIssue({
        code: "custom",
        path: ["emergencyPhone"],
        message: t.emergencySamePhone,
      });
    })
    .superRefine((input, ctx) => {
      if (input.emergencyIsParent) return;
      if (ageOn(input.birthDate, new Date().toISOString()) >= 18) return;
      ctx.addIssue({
        code: "custom",
        path: ["emergencyIsParent"],
        message: t.minorNeedsParent,
      });
    });
}

/** Русская схема — по умолчанию и для тестов. */
export const profileInputSchema = profileInputSchemaFor("ru");

export type ProfileInput = z.infer<typeof profileInputSchema>;
