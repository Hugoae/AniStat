import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Configuration graphql-codegen.
 *
 * - `schema` : introspection live de l'endpoint AniList. Comme le schéma
 *   n'évolue pas souvent, on régénère à la main via `npm run codegen`.
 * - `documents` : queries/mutations écrites dans le code source. On scanne
 *   tous les `.ts` / `.tsx` de `src` pour trouver les tags `gql`.
 * - `generates` : un seul fichier `src/types/anilistGraphql.ts` regroupe les
 *   types du schéma + les types d'opérations (une entrée par query tagguée).
 *
 * Le fichier généré est commité dans le repo afin que les développeurs n'aient
 * pas besoin de relancer `codegen` pour builder (la CI ferait pareil).
 */
const config: CodegenConfig = {
  overwrite: true,
  schema: "https://graphql.anilist.co",
  documents: ["src/**/*.{ts,tsx}"],
  generates: {
    "src/types/anilistGraphql.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        // Préserve les commentaires en tête du fichier généré
        skipTypename: false,
        // Évite les imports absolus surprenants
        avoidOptionals: false,
        // Unions discriminées par `__typename` si présent
        enumsAsTypes: true,
        dedupeFragments: true,
      },
    },
  },
  ignoreNoDocuments: false,
};

export default config;
