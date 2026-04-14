import { HomeLanding, type HomeLandingProps } from "../components/HomeLanding";

/** Route « accueil » : saisie du pseudo avant chargement du dashboard. */
export function HomePage(props: HomeLandingProps) {
  return <HomeLanding {...props} />;
}
