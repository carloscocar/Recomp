# Recomp — your physique tracker

A personal fat-loss + muscle-recomposition app: photo-based calorie/macro logging,
workout tracking, streaks, and Strava sync. Built with Vite + React, deploys free
to Vercel, installs to your phone's home screen like an app.

**It works the moment you deploy** — no accounts, no keys required. Everything below
(AI meals, login/sync, Strava) is optional and switched on with environment variables
whenever you're ready.

---

## 1. Deploy it (free, ~5 min)

You do **not** need to buy a domain. Vercel gives you a free `your-app.vercel.app`
URL with HTTPS — enough for personal use, home-screen install, and even Strava login.

1. Push this folder to a GitHub repo (or drag-drop into Vercel).
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Framework preset: **Vite** (auto-detected). Click **Deploy**.
4. Open the `*.vercel.app` link. Done — it runs in local mode (data saved on that device).

Run it locally instead: `npm install` then `npm run dev`.

---

## 2. Turn on the AI meal camera

The photo → calories feature calls Claude through a serverless function so your key
stays secret.

1. Get a key at [console.anthropic.com](https://console.anthropic.com) → API Keys.
2. Vercel → your project → **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key
3. **Redeploy** (Deployments → ⋯ → Redeploy). Until this is set, use **Add manually**.

Cost: each photo is one small Sonnet call — fractions of a cent. You can swap the
model in `api/analyze-meal.js`.

**Photo troubleshooting:** iPhone HEIC photos are auto-converted to JPEG in the
browser before sending, so they work fine. If a photo fails, the app tells you why —
"isn't connected yet" means `ANTHROPIC_API_KEY` isn't set (or you haven't redeployed
since adding it).

---

## 3. Turn on login + cross-device sync (optional)

Without this, data lives on one device. Add Supabase to log in once and have the same
data on web + phone.

1. Create a free project at [supabase.com](https://supabase.com).
2. **Project → SQL Editor**, run this:

   ```sql
   create table app_state (
     user_id uuid references auth.users not null,
     key text not null,
     value jsonb,
     primary key (user_id, key)
   );
   alter table app_state enable row level security;
   create policy "own rows" on app_state
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

3. **Project → Settings → API**, copy the URL and the `anon` public key.
4. Add to Vercel env vars, then redeploy:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
5. (Optional) Supabase → Authentication → turn off "Confirm email" for instant signup.

Now the app shows a sign-in screen and syncs everywhere.

---

## 4. Turn on Strava sync (optional)

1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api).
   - **Authorization Callback Domain**: your Vercel domain *without* `https://`
     (e.g. `your-app.vercel.app`). For local testing add `localhost`.
2. Copy the **Client ID** and **Client Secret**.
3. Add to Vercel env vars, then redeploy:
   - `VITE_STRAVA_CLIENT_ID` = client id
   - `STRAVA_CLIENT_ID` = client id (again, for the server)
   - `STRAVA_CLIENT_SECRET` = client secret (server-only — no `VITE_` prefix)
4. In the app: **You → Connections → Strava → Connect**, approve, then
   **Import recent activities**. Runs, rides, and lifts land on their real dates and
   count toward your streak.

Note: for a personal app, Strava tokens are passed back via the URL fragment and
stored client-side. Fine for one user; for a multi-user product you'd store tokens
server-side instead.

---

## 5. Add to your phone's home screen

1. Open your `*.vercel.app` link in **Safari** (iOS) or **Chrome** (Android).
2. Share → **Add to Home Screen**.
3. Launches fullscreen with its own icon. If you added Supabase login, you stay
   signed in, so it behaves like a normal app.

---

## Apple Health

Not available in this web version, and not a "coming soon" — Apple Health (HealthKit)
can only be read by a native iOS app with special entitlements; no website can touch
it. Getting Health sync means building a native app (Swift, or React Native with the
`react-native-health` bridge) — a separate, bigger project. Strava covers most of the
same activity data in the meantime.

## Project map

```
api/analyze-meal.js        Anthropic meal-photo proxy (key stays server-side)
api/strava/callback.js     Strava OAuth token exchange
api/strava/activities.js   Pulls activities, auto-refreshes tokens
src/App.jsx                All UI, auth gating, logging, streaks
src/lib/storage.js         Supabase-when-logged-in / localStorage fallback
src/lib/targets.js         Calorie + macro math
src/lib/supabase.js        Client (null = local mode)
```

Targets here are estimates for general fitness, not medical advice — check with a
doctor or registered dietitian before any big change.
