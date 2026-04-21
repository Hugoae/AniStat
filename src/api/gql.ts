/**
 * Tag `gql` pour les template literals GraphQL.
 *
 * Ce tag est volontairement une simple identité à l'exécution : son seul rôle
 * est d'être détectable statiquement par graphql-codegen, qui scanne les
 * sources pour y trouver les opérations à typer. À runtime, on reconstruit la
 * chaîne comme `String.raw` sans interpolation (on n'utilise jamais
 * d'interpolation dans nos queries : les variables passent par `$name` + un
 * objet `variables`).
 */
export function gql(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
  if (values.length === 0) return strings[0] ?? "";
  let out = "";
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) out += String(values[i]);
  }
  return out;
}
