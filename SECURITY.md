# Politique de sécurité

## Versions supportées

Seule la dernière version déployée d'AniStat est maintenue. Les correctifs de
sécurité sont appliqués sur la branche `main`.

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d'issue publique** pour une faille de sécurité.

- Utilise l'onglet **Security → Report a vulnerability** du dépôt
  (GitHub Private Vulnerability Reporting), ou
- contacte le mainteneur en privé via son [profil GitHub](https://github.com/Hugoae).

Inclus si possible :
- une description de la faille et de son impact,
- les étapes de reproduction,
- la version / commit concerné.

Délai de première réponse visé : **72 h**.

## Périmètre

AniStat est une application **front-end** qui lit des profils **AniList publics**.

- **Aucune authentification utilisateur** : pas de mots de passe ni de sessions.
- **Clé Supabase `anon`** exposée côté client : c'est attendu. Elle est limitée
  par les politiques **Row Level Security** (RLS) et ne donne accès qu'à des
  données AniList publiques mises en cache.
- **Secrets serveur** (`SUPABASE_SERVICE_ROLE_KEY`, tokens Upstash) : présents
  uniquement dans les variables d'environnement de déploiement, jamais dans le
  bundle ni dans le dépôt.

## Bonnes pratiques appliquées

- Aucun secret en dur dans le code (tout passe par les variables d'environnement).
- `.gitignore` bloque `.env*`, clés, certificats et fichiers de credentials.
- En-têtes de sécurité HTTP en production (CSP, HSTS, `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) — voir `vercel.json`.
- Proxy AniList limité au verbe `POST`, avec plafond de taille de requête.
- Mises à jour de dépendances surveillées via Dependabot.

## Modèle de menace connu

Les tables de cache acceptent des écritures via la clé `anon` (voir
`supabase/README.md`). Le contenu se limitant à des statistiques AniList
**publiques**, ce compromis est accepté pour ce projet. Aucune donnée privée
ni personnelle n'y est stockée.
