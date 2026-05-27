# AniStat Supabase Setup

AniStat uses Supabase as the source of truth for AniList profiles, media list
snapshots, activities, and sync diagnostics.

## Access Model

- Browser (`VITE_SUPABASE_ANON_KEY`): read-only access through public `SELECT`
  policies.
- Server (`SUPABASE_SERVICE_ROLE_KEY`): writes only through
  `POST /api/supabase-sync`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` with a `VITE_` prefix.

## Local Environment

Create `.env.local` from `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`npm run dev` exposes the same `/api/supabase-sync` contract as Vercel through
the Vite middleware in `vite.config.ts`.

## Production Environment

Set these variables in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Deploy the API route before locking anon writes. The current migrations already
assume writes are routed through `/api/supabase-sync`.

## Migrations

Migration order:

1. `20260527100000_initial_anistat_schema.sql`
   - Tables, constraints, indexes, `updated_at` triggers, RLS, public read
     policies.
2. `20260527120000_lock_anon_writes.sql`
   - Removes permissive anon write policies.
3. `20260527214500_optimize_supabase_reads.sql`
   - Adds lowercase user lookup support and documents the activity read path.
4. `20260527215000_fix_updated_at_search_path.sql`
   - Fixes the `set_updated_at()` trigger function `search_path` for the
     Supabase security advisor.

Apply migrations with the Supabase CLI or via the dashboard/MCP in a controlled
environment. Avoid applying schema changes directly without adding a migration
file to this folder.

## Read Paths Used by the App

- `tracked_users.anilist_name_lower = lower(username)` for profile lookup.
- `media_list_snapshots (anilist_user_id, media_type)` for cached lists.
- `activities (anilist_user_id, activity_type, created_at_unix desc)` for
  yearly activity reads.

## Write Paths Used by the App

`src/services/supabaseService.ts` keeps browser reads direct, but writes call:

- `upsertUser`
- `saveMediaListSnapshot`
- `saveActivities`
- `updateActivitySyncState`
- `recordSyncRun`

All of these are handled server-side in `api/lib/supabaseWriteCore.js`.
