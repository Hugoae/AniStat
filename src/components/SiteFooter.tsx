import { useEffect, useState } from "react";
import { SITE } from "../config/site";
import { useT, type TFunction } from "../i18n/I18n";

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
  const t = useT();
  const [legalOpen, setLegalOpen] = useState(false);
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <span className="site-footer__name">{SITE.name}</span>
          <span className="site-footer__tagline">{t("Statistiques de profils AniList", "AniList profile stats")}</span>
        </div>

        <p className="site-footer__disclaimer">
          {t(
            "Projet non officiel, sans affiliation avec AniList. Données et images © AniList.",
            "Unofficial project, not affiliated with AniList. Data and images © AniList."
          )}
        </p>

        <nav className="site-footer__links" aria-label={t("Liens du pied de page", "Footer links")}>
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
            {t("Mentions légales", "Legal notice")}
          </button>
        </nav>

        <p className="site-footer__credit">
          {t("Créé par", "Created by")}{" "}
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

      {legalOpen ? <LegalModal onClose={() => setLegalOpen(false)} t={t} /> : null}
    </footer>
  );
}

function LegalModal({ onClose, t }: { onClose: () => void; t: TFunction }) {
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
          aria-label={t("Fermer", "Close")}
        >
          ×
        </button>

        <h2 id="legal-modal-title" className="legal-modal__title">
          {t("Mentions légales & confidentialité", "Legal notice & privacy")}
        </h2>

        <div className="legal-modal__body">
          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">{t("Nature du site", "About this site")}</h3>
            <p>
              {t(
                `${SITE.name} est un projet personnel et non commercial qui permet de visualiser les statistiques d'un profil AniList public. Ce site n'est ni affilié, ni sponsorisé, ni approuvé par AniList.`,
                `${SITE.name} is a personal, non-commercial project to visualize the statistics of a public AniList profile. This site is not affiliated with, sponsored by, or endorsed by AniList.`
              )}
            </p>
          </section>

          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">{t("Données affichées", "Displayed data")}</h3>
            <p>
              {t(
                "Les données (listes, notes, activités) et les images (jaquettes, bannières, avatars) proviennent de l'API publique d'AniList et restent la propriété de leurs détenteurs respectifs. Seuls les profils publics peuvent être consultés.",
                "Data (lists, scores, activity) and images (covers, banners, avatars) come from AniList's public API and remain the property of their respective owners. Only public profiles can be viewed."
              )}
            </p>
          </section>

          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">{t("Confidentialité", "Privacy")}</h3>
            <p>
              {t(
                `${SITE.name} ne demande aucun mot de passe et ne collecte pas de données personnelles à des fins publicitaires. Les statistiques d'un profil consulté peuvent être mises en cache (via Supabase) afin d'accélérer les chargements suivants, ces données proviennent uniquement d'AniList et peuvent être régénérées à tout moment.`,
                `${SITE.name} never asks for a password and does not collect personal data for advertising. A viewed profile's statistics may be cached (via Supabase) to speed up later loads; this data comes only from AniList and can be regenerated at any time.`
              )}
            </p>
          </section>

          <section className="legal-modal__section">
            <h3 className="legal-modal__heading">{t("Contact", "Contact")}</h3>
            <p>
              {t(
                "Pour toute question, demande de retrait ou signalement de bug, ouvrez un ticket sur",
                "For any question, removal request or bug report, open an issue on"
              )}{" "}
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
