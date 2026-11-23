// Переменные читаются функциями, а не на верхнем уровне модуля: иначе отсутствие
// .env.local роняло бы сборку целиком, вместе со страницами, которым Supabase
// вообще не нужен.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Не задана переменная окружения ${name}. ` +
        `Локально: скопируй .env.example в .env.local и подставь значения из ` +
        `панели Supabase (Project Settings → API). ` +
        `На Vercel: Settings → Environment Variables.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
