# AniStat — Supabase

AniStat utilise Supabase comme source de vérité pour les profils AniList, les
snapshots de listes, les activités et les diagnostics de synchronisation.

## Modèle d'accès

AniStat est une application **100 % front-end** : le navigateur lit **et écrit**
directement dans Supabase avec la clé `anon`.

- **Clé `anon` (`VITE_SUPABASE_ANON_KEY`)** : publique par conception, injectée
  dans le bundle navigateur. Lectures via les politiques `SELECT`, écritures de
  cache via les politiques `INSERT`/`UPDATE` réservées au rôle `anon`.
- **Aucune clé `service_role` n'est utilisée côté application.** Ne jamais
  exposer un `SUPABASE_SERVICE_ROLE_KEY` avec un préfixe `VITE_`.

> **Compromis de sécurité assumé.** Les politiques RLS autorisent l'écriture
> anonyme sur les tables de cache (`tracked_users`, `media_list_snapshots`,
> `activities`, `activity_sync_state`, `sync_runs`). Le contenu se limitant à
> des **statistiques AniList publiques**, ce choix est acceptable pour ce
> projet. Aucune donnée privée ou personnelle n'y est stockée.

## Environnement local

Créer `.env.local` à partir de `.env.example` :

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Production (Vercel)

Définir ces variables dans Vercel :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Migrations

Ordre d'application :

1. `20260527100000_initial_anistat_schema.sql`
   - Tables, contraintes, index, triggers `updated_at`, RLS, politiques de
     lecture publique.
2. `20260527120000_lock_anon_writes.sql`
   - Retire les politiques d'écriture anonyme (variante « écritures serveur »).
3. `20260527214500_optimize_supabase_reads.sql`
   - Lookup utilisateur en minuscules et documentation du chemin de lecture.
4. `20260527215000_fix_updated_at_search_path.sql`
   - Corrige le `search_path` de `set_updated_at()` (advisor de sécurité).
5. `20260531150000_allow_anon_cache_writes.sql`
   - Réautorise les écritures anonymes de cache (modèle actuel, voir ci-dessus).

Appliquer les migrations via la CLI Supabase ou le dashboard dans un
environnement contrôlé. Ne pas modifier le schéma sans ajouter de fichier de
migration dans ce dossier.

## Chemins de lecture utilisés par l'app

- `tracked_users.anilist_name_lower = lower(username)` pour le profil.
- `media_list_snapshots (anilist_user_id, media_type)` pour les listes en cache.
- `activities (anilist_user_id, activity_type, created_at_unix desc)` pour les
  activités annuelles.

## Chemins d'écriture utilisés par l'app

Toutes les écritures passent par `src/services/supabaseService.ts` avec la clé
`anon` :

- `upsertUser`
- `saveMediaListSnapshot`
- `saveActivities`
- `updateActivitySyncState`
- `recordSyncRun`
