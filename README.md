# Recipe Box

Snap photos of paper recipes and have them read, categorized and saved. Plan a week of meals, get one merged shopping list, tick off what you already have, and share recipes with friends. It installs to a phone's home screen as an app (PWA).

## Features

- **Photo import:** take or choose up to 12 photos (pages) per recipe. Claude reads them into a title, ingredients, steps, category, tags and a grocery aisle for each ingredient. You review and fix before saving. You can also paste recipe text or type one in.
- **Recipe view:** scale servings, tick off ingredients, **Keep screen on** switch (Screen Wake Lock), Big text mode, and **Print** (a clean print layout).
- **Ratings and favorites:** give any recipe your own 1 to 5 stars and a heart. Filter the box to favorites or sort by rating. Ratings are personal, so friends never see them.
- **Meal plan:** add recipes to days of the week and set servings per meal.
- **Shopping list:** built from the meal plan with amounts merged and grouped by aisle. Mark items you already have, edit amounts, add your own items, check things off in the store, and copy the list.
- **Friends:** add friends by email. Share single recipes, or let friends see your whole box. Friends can save a copy into their own box.

## How it's built

- React + TypeScript + Vite, installable as a PWA (`vite-plugin-pwa`)
- Supabase: email/password login, Postgres with row level security, private photo storage
- Supabase Edge Function `read-recipe` calls the Claude API (`claude-opus-5-5`) with structured JSON output. It only serves signed-in users and caps each person at 40 reads a day.

```
src/            app (pages/, lib/)
supabase/
  migrations/   database schema and security rules (already applied)
  functions/    read-recipe edge function (already deployed)
```

## Setup

1. **Anthropic API key:** add a secret named `ANTHROPIC_API_KEY` under Supabase → Edge Functions → Secrets.
2. **Hosting (Vercel):** import this repo at vercel.com/new. Framework preset Vite, build `npm run build`, output `dist`. No environment variables are needed; the Supabase URL and public key are in `src/lib/supabase.ts` (override with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
3. **Supabase Auth URL:** in Supabase → Authentication → URL Configuration, set **Site URL** to your Vercel address so sign-up confirmation emails link back to the app.

## Develop

```
npm install
npm run dev     # local app
npm test        # ingredient parsing and shopping list tests
npm run build
```

## Install on a phone

- **iPhone:** open the site in Safari → Share → Add to Home Screen.
- **Android:** open it in Chrome → menu → Install app.
