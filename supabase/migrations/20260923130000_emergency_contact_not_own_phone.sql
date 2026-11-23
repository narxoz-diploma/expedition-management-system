-- Профиль, где в контакте на случай ЧП стоит свой же номер, — неполный.
--
-- С 22 сентября 2026 форма профиля не сохраняет такой контакт
-- (lib/profile-validation.ts), но уже заведённые профили проверка формы не
-- видит: запросом нашлось 10 человек, вписавших себя, чтобы пройти
-- обязательное поле. Такой контакт хуже пустого — с маршрута лидер позвонит
-- тому, с кем случилась беда. Решение автора: не предупреждать, а закрыть
-- запись до исправления — сайт покажет «Заполнить профиль и записаться», а
-- форма объяснит, что не так с номером.
--
-- Номера в обеих таблицах хранятся приведёнными (normalizePhone), поэтому
-- сравнение строк достаточно. Приложение повторяет правило в
-- missingFieldKeys() (lib/profile.ts) — чтобы сказать до нажатия, а не
-- отказом базы после. Миграция только ужесточает проверку, её можно
-- применять раньше кода: без кода человек увидит отказ записи с просьбой
-- заполнить профиль, просто без подсказки, какое поле.

create or replace function profile_is_complete(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user
      and p.phone is not null
      and p.birth_date is not null
      and p.consent_pd_at is not null
      and p.fitness_level is not null
      and exists (
        select 1 from emergency_contacts ec
         where ec.user_id = p.id and ec.phone is distinct from p.phone
      )
  );
$$;
