// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

/**
 * Configuration ESLint (flat config, v9+).
 *
 * Objectifs :
 *  - Base TypeScript + JS recommandée (typescript-eslint).
 *  - Règles React Hooks (dépendances correctes de useEffect/useMemo/…).
 *  - Règles React Refresh (chaque fichier exportant un composant ne doit
 *    exporter QUE des composants, pour que le HMR fonctionne correctement).
 *
 * Fichiers ignorés : `dist/`, `node_modules/`, `scripts/` (scripts Node maison
 * pas pertinents pour le lint front), `terminals/` si présent, et la config
 * elle-même.
 */
export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "scripts",
      "tests",
      "terminals",
      // Fichier généré par graphql-codegen : ne pas lint, régénérer via `npm run codegen`.
      "src/types/anilistGraphql.ts",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Laisse passer les variables prefixées `_` (convention pour « voulu inutilisé »).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Laisse passer les `any` explicites : quelques casts Recharts / fetch response
      // restent inévitables tant qu'on ne génère pas de types GraphQL.
      "@typescript-eslint/no-explicit-any": "off",
      /*
       * Règles React Hooks v7 désactivées ou assouplies :
       *
       * - `set-state-in-effect` (v7+, off) : la règle considère tout
       *   `setState` dans un `useEffect` comme une cascade de renders à
       *   éviter. Dans notre code, plusieurs effets synchronisent un état
       *   dérivé d'une prop qui change (sélection de période, première
       *   année valide, clamp d'un index). C'est un usage légitime et
       *   documenté par React. La règle génère trop de faux-positifs pour
       *   apporter une vraie valeur ici.
       * - `preserve-caught-error` (warn) : on garde un rappel doux pour
       *   attacher `{ cause }` aux erreurs re-lancées, mais ce n'est pas
       *   bloquant (certains cas de throw "cosmétique" n'ont pas d'intérêt
       *   à propager l'original).
       */
      "react-hooks/set-state-in-effect": "off",
      /*
       * Règles liées au React Compiler (bêta, v7+) — désactivées :
       *  - `preserve-manual-memoization` : signale quand les deps d'un
       *    useMemo/useCallback ne sont pas exactement celles que le
       *    Compiler inférerait. Informatif uniquement, pas de bug réel.
       *  - `immutability` : détecte des self-references dans des useCallback
       *    qui sont en pratique résolues par la stabilité de leur retour.
       * On les réactivera le jour où on adopte effectivement React Compiler.
       */
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
    },
  }
);
