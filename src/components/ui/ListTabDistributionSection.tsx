import { C, STATUS_COLORS, statusLabel } from "../../config/constants";
import { SectionTitle } from "./SectionTitle";
import { MediaOriginFlagSvg } from "./MediaOriginFlagSvg";
import { mediaCountryOriginMeta, mediaFormatShortLabel } from "./mediaDisplayHelpers";
import { useT, useLang } from "../../i18n/I18n";

type ListTabDistributionSectionProps = {
  /** Préfixe d'identifiants DOM/ARIA propre à l'onglet ("anime" | "manga"). */
  idPrefix: string;
  /** Nom du média au singulier pour les libellés ARIA ("anime" | "manga"). */
  mediaNoun: string;
  statusEntriesOrdered: [string, number][];
  countryEntriesOrdered: [string, number][];
  fmtData: { name: string; value: number }[];
};

/**
 * Bloc « Par statut / Par pays d'origine / Par format » des onglets liste.
 * Identique côté anime et manga (seuls les identifiants et le nom du média
 * dans les libellés ARIA varient).
 */
export function ListTabDistributionSection({
  idPrefix,
  mediaNoun,
  statusEntriesOrdered,
  countryEntriesOrdered,
  fmtData,
}: ListTabDistributionSectionProps) {
  const t = useT();
  const lang = useLang();
  return (
    <section
      id={`${idPrefix}-repartition`}
      className="overview-section fade-in list-tab-distribution-section list-tab-anchor"
      aria-labelledby={`${idPrefix}-par-statut-title`}
    >
      <div className="list-tab-distribution">
        <div className="list-tab-distribution__col">
          <SectionTitle size="lg" id={`${idPrefix}-par-statut-title`}>
            {t("Par statut", "By status")}
          </SectionTitle>
          <div className="list-tab-distro-row">
            {statusEntriesOrdered.map(([s, c]) => (
              <div key={s} className="list-tab-status-pill">
                <span className="list-tab-status-pill__count" style={{ color: STATUS_COLORS[s] || C.accent }}>
                  {String(c)}
                </span>
                <span className="list-tab-status-pill__label">{statusLabel(s, lang) || s}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="list-tab-distribution__col">
          <SectionTitle size="lg" id={`${idPrefix}-par-pays-title`}>
            {t("Par pays d'origine", "By country of origin")}
          </SectionTitle>
          <div className="list-tab-distro-row">
            {countryEntriesOrdered.map(([code, c]) => {
              const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code, lang);
              const label = meta ? meta.label : t("Inconnu", "Unknown");
              const a11yCountry = meta ? meta.label : t("pays inconnu", "unknown country");
              const countStr = String(c);
              return (
                <div
                  key={code}
                  className="list-tab-origin-pill"
                  role="group"
                  aria-label={`${countStr} ${mediaNoun} · ${a11yCountry}`}
                >
                  <span className="list-tab-status-pill__count" style={{ color: C.accent }}>
                    {countStr}
                  </span>
                  <div className="list-tab-origin-pill__meta">
                    <span className="list-tab-origin-pill__flag" aria-hidden>
                      {meta ? (
                        <MediaOriginFlagSvg code={meta.code} width={20} height={13} />
                      ) : (
                        <span className="list-tab-origin-pill__flag-unknown">?</span>
                      )}
                    </span>
                    <span className="list-tab-origin-pill__name">{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="list-tab-distribution__col">
          <SectionTitle size="lg" id={`${idPrefix}-par-format-title`}>
            {t("Par format", "By format")}
          </SectionTitle>
          <div className="list-tab-distro-row">
            {fmtData.map(({ name, value: fv }) => (
              <div key={name} className="list-tab-status-pill">
                <span className="list-tab-status-pill__count" style={{ color: C.accent }}>
                  {String(fv)}
                </span>
                <span className="list-tab-status-pill__label">{mediaFormatShortLabel(name) || name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
