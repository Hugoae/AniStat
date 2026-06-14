type ChartCollapseToggleProps = {
  collapsed: boolean;
  onToggle: () => void;
  /** Libellé du graphique : utilisé pour l'aria-label lecteur d'écran. */
  chartTitle: string;
  /** Optionnel : id de l'élément contenu (pour aria-controls). */
  controlsId?: string;
  /** Classe additionnelle (ex. positionnement custom). */
  className?: string;
};

/**
 * Bouton chevron uniformisé pour masquer / afficher le contenu d'un bloc graphique.
 * Pivot CSS du chevron selon `collapsed` (icône unique → moins d'effets de re-render et CLS).
 */
export function ChartCollapseToggle({
  collapsed,
  onToggle,
  chartTitle,
  controlsId,
  className,
}: ChartCollapseToggleProps) {
  return (
    <button
      type="button"
      className={`chart-collapse-toggle${collapsed ? " is-collapsed" : ""}${className ? ` ${className}` : ""}`}
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={controlsId}
      aria-label={`${collapsed ? "Afficher" : "Masquer"} le graphique « ${chartTitle} »`}
      title={collapsed ? `Afficher « ${chartTitle} »` : `Masquer « ${chartTitle} »`}
    >
      <svg
        className="chart-collapse-toggle__icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          d="M3.5 6 8 10.5 12.5 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
