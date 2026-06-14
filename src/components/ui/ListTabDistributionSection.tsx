import { C, STATUS_LABELS, STATUS_COLORS } from "../../config/constants";
import { SectionTitle } from "./SectionTitle";
import { MediaOriginFlagSvg } from "./MediaOriginFlagSvg";
import { mediaCountryOriginMeta, mediaFormatShortLabel } from "./mediaDisplayHelpers";

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
  return (
    <section
      id={`${idPrefix}-repartition`}
      className="overview-section fade-in list-tab-distribution-section list-tab-anchor"
      aria-labelledby={`${idPrefix}-par-statut-title`}
    >
      <div className="list-tab-distribution">
        <div className="list-tab-distribution__col">
          <SectionTitle size="lg" id={`${idPrefix}-par-statut-title`}>
            Par statut
          </SectionTitle>
          <div className="list-tab-distro-row">
            {statusEntriesOrdered.map(([s, c]) => (
              <div key={s} className="list-tab-status-pill">
                <span className="list-tab-status-pill__count" style={{ color: STATUS_COLORS[s] || C.accent }}>
                  {String(c)}
                </span>
                <span className="list-tab-status-pill__label">{STATUS_LABELS[s] || s}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="list-tab-distribution__col">
          <SectionTitle size="lg" id={`${idPrefix}-par-pays-title`}>
            Par pays d’origine
          </SectionTitle>
          <div className="list-tab-distro-row">
            {countryEntriesOrdered.map(([code, c]) => {
              const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code);
              const label = meta ? meta.label : "Inconnu";
              const a11yCountry = meta ? meta.label : "pays inconnu";
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
            Par format
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
