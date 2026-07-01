import { useEffect, useState } from "react";
import { SITE } from "../config/site";

const ANILIST_URL = "https://anilist.co";
const GITHUB_URL = "https://github.com/Hugoae/AniStat";
const GITHUB_ISSUES_URL = "https://github.com/Hugoae/AniStat/issues";
const AUTHOR = "Hugoae";

/**
 * Footer global du dashboard : attribution AniList (le site n'est pas
 * affilié), liens externes, crédit auteur et une modale « Mentions légales /
 * Confidentialité ». La modale gère son propre état (ouverture/fermeture au
 * clic hors carte, touche Échap, bouton ×).
 */
export function SiteFooter() {
  const [legalOpen, setLegalOpen] = useState(false);
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <span className="site-footer__name">{SITE.name}</span>
          <span className="site-footer__tagline">Statistiques de profils AniList</span>
        </div>

        <p className="site-footer__disclaimer">
          Projet non officiel, sans affiliation avec AniList. Données et images © AniList.
        </p>

        <nav className="site-footer__links" aria-label="Liens du pied de page">
          <a
            className="site-footer__link"
            href={ANILIST_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            AniList
          </a>
          <a
            className="site-footer__link"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <button
            type="button"
            className="site-footer__legal-btn"
            onClick={() => setLegalOpen(true)}
          >
            Mentions légales
          </button>
        </nav>

        <p className="site-footer__credit">
          Créé par{" "}
          <a
            className="site-footer__link"
            href={`https://github.com/${AUTHOR}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {AUTHOR}
          </a>{" "}
          · © {year}
        </p>
      </div>

      {legalOpen ? <LegalModal onClose={() => setLegalOpen(false)} /> : null}
    </footer>
  );
}

function LegalModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="legal-modal__overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="legal-modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="legal-modal__close"
          onClick={onClose}
          aria-label="Fermer"
        >
          ×
        </button>

        <h2 id="legal-modal-title" className="legal-modal__title">
          Mentions légales & confidentialité
        </h2>

        <div className="legal-modal__body">
          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">Nature du site</h3>
            <p>
              {SITE.name} est un projet personnel et non commercial qui permet de
              visualiser les statistiques d&apos;un profil AniList public. Ce site
              n&apos;est ni affilié, ni sponsorisé, ni approuvé par AniList.
            </p>
          </section>

          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">Données affichées</h3>
            <p>
              Les données (listes, notes, activités) et les images (jaquettes,
              bannières, avatars) proviennent de l&apos;API publique d&apos;AniList et
              restent la propriété de leurs détenteurs respectifs. Seuls les profils
              publics peuvent être consultés.
            </p>
          </section>

          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">Confidentialité</h3>
            <p>
              {SITE.name} ne demande aucun mot de passe et ne collecte pas de données
              personnelles à des fins publicitaires. Les statistiques d&apos;un profil
              consulté peuvent être mises en cache (via Supabase) afin d&apos;accélérer
              les chargements suivants, ces données proviennent uniquement d&apos;AniList
              et peuvent être régénérées à tout moment.
            </p>
          </section>

          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">Contact</h3>
            <p>
              Pour toute question, demande de retrait ou signalement de bug, ouvrez un
              ticket sur{" "}
              <a
                className="site-footer__link"
                href={GITHUB_ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
