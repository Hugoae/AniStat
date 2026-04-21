import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MONTHS, MONTHS_FULL } from "../../config/constants";

export type PeriodFloatingChipProps = {
  /** Années pour lesquelles le profil dispose d'activités ; borne la navigation. */
  years: number[];
  /** Année sélectionnée (pilotée par l'appelant). */
  year: number;
  /** Mois sélectionné : 0 = « Toute l'année », 1..12 = mois classique. */
  month: number;
  /** Callback pour changer d'année, validée contre `years`. */
  changeYear: (y: number) => void;
  /** Callback pour changer de mois (0..12). */
  setMonth: (m: number) => void;
};

/** Passe la première lettre d'une chaîne en majuscule (sans toucher à la casse du reste). */
function capitalize(label: string): string {
  return label.length > 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

/**
 * Chip flottant de sélection de période, ancré dans l'espace libre à droite
 * du contenu principal, toujours visible quel que soit le scroll.
 *
 * Architecture des contrôles :
 *  - Chevrons verticaux (▲ / ▼) : navigation **année** uniquement, bornée par
 *    la plus petite / plus grande année présente dans `years`.
 *  - Chevrons horizontaux (◀ / ▶) entourant la valeur : navigation **mois**
 *    au sein de l'année courante uniquement. La séquence est
 *    `[Toute l'année, Jan, Fév … Déc]` : ◀ désactivé sur « Toute l'année »,
 *    ▶ désactivé sur décembre. Aucun rollover d'année ici — volontairement,
 *    pour que les deux axes (année / mois) restent orthogonaux.
 *  - Bouton « Modifier » : ouvre un popover contenant les pills complètes
 *    (toutes années + tous mois) pour les sauts non contigus.
 *
 * Le popover se ferme sur Escape, clic extérieur, ou second clic sur
 * « Modifier ». Le focus retourne sur le déclencheur à la fermeture Escape.
 */
export function PeriodFloatingChip({
  years,
  year,
  month,
  changeYear,
  setMonth,
}: PeriodFloatingChipProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const modifyBtnRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();

  const sortedYears = useMemo(() => [...years].sort((a, b) => a - b), [years]);
  const minYear = sortedYears[0] ?? year;
  const maxYear = sortedYears[sortedYears.length - 1] ?? year;

  const monthLabel = useMemo(() => {
    if (month === 0) return "Toute l'année";
    const name = MONTHS_FULL[month - 1] ?? MONTHS[month - 1] ?? "";
    return capitalize(name);
  }, [month]);

  /* Navigation verticale = année uniquement (▲ = +1 année, ▼ = -1 année). */
  const canGoPrevYear = year > minYear;
  const canGoNextYear = year < maxYear;

  const goPrevYear = useCallback(() => {
    if (!canGoPrevYear) return;
    changeYear(year - 1);
  }, [canGoPrevYear, year, changeYear]);

  const goNextYear = useCallback(() => {
    if (!canGoNextYear) return;
    changeYear(year + 1);
  }, [canGoNextYear, year, changeYear]);

  /*
   * Navigation horizontale = séquence [Toute l'année, Jan, Fév … Déc] de l'année
   * courante. « Toute l'année » est la première position (à gauche) : ◀ y est
   * désactivé ; ▶ va à janvier. Inversement, ▶ est désactivé sur décembre.
   * Les passages entre années se font via les chevrons verticaux (▲ / ▼).
   */
  const canGoPrevMonth = month > 0;
  const canGoNextMonth = month < 12;

  const goPrevMonth = useCallback(() => {
    if (!canGoPrevMonth) return;
    /* month > 0 ici : Jan → Toute l'année, Fév → Jan, … */
    setMonth(month - 1);
  }, [canGoPrevMonth, month, setMonth]);

  const goNextMonth = useCallback(() => {
    if (!canGoNextMonth) return;
    /* month < 12 ici : Toute l'année → Jan, Jan → Fév, … */
    setMonth(month + 1);
  }, [canGoNextMonth, month, setMonth]);

  /* Escape + clic extérieur pour fermer le popover. */
  useEffect(() => {
    if (!popoverOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPopoverOpen(false);
        modifyBtnRef.current?.focus();
      }
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (modifyBtnRef.current?.contains(target)) return;
      setPopoverOpen(false);
    };
    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("mousedown", handleClick, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("mousedown", handleClick, true);
    };
  }, [popoverOpen]);

  return (
    <aside
      className="period-floating-chip"
      role="region"
      aria-label="Navigation période"
    >
      <div className="period-floating-chip__label">Période</div>
      <button
        type="button"
        className="period-floating-chip__nav-btn period-floating-chip__nav-btn--up"
        onClick={goNextYear}
        disabled={!canGoNextYear}
        aria-label="Année suivante"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
      <div className="period-floating-chip__value-row">
        <button
          type="button"
          className="period-floating-chip__nav-btn-side period-floating-chip__nav-btn-side--left"
          onClick={goPrevMonth}
          disabled={!canGoPrevMonth}
          aria-label="Mois précédent"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="period-floating-chip__value" aria-live="polite">
          <span className="period-floating-chip__year">{year}</span>
          <span className="period-floating-chip__month">{monthLabel}</span>
        </div>
        <button
          type="button"
          className="period-floating-chip__nav-btn-side period-floating-chip__nav-btn-side--right"
          onClick={goNextMonth}
          disabled={!canGoNextMonth}
          aria-label="Mois suivant"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        className="period-floating-chip__nav-btn period-floating-chip__nav-btn--down"
        onClick={goPrevYear}
        disabled={!canGoPrevYear}
        aria-label="Année précédente"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button
        ref={modifyBtnRef}
        type="button"
        className="period-floating-chip__modify-btn"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-expanded={popoverOpen}
        aria-controls={popoverId}
        aria-haspopup="dialog"
      >
        Modifier
      </button>
      {popoverOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          className="period-floating-chip__popover"
          role="dialog"
          aria-label="Sélection de la période"
        >
          <div className="period-panel-title">Période d'analyse</div>
          <div className="period-pills period-pills--years">
            {sortedYears.map((y) => (
              <button
                key={y}
                type="button"
                className={`period-pill ${y === year ? "active" : ""}`}
                onClick={() => changeYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
          <div className="period-divider" />
          <div className="period-pills period-pills--months">
            <button
              type="button"
              className={`period-pill period-pill--wide ${month === 0 ? "active" : ""}`}
              onClick={() => setMonth(0)}
            >
              Toute l'année
            </button>
            {MONTHS.map((m, idx) => (
              <button
                key={m}
                type="button"
                className={`period-pill ${month === idx + 1 ? "active" : ""}`}
                onClick={() => setMonth(idx + 1)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
