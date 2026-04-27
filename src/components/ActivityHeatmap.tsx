import { useId, useMemo, useState, type ReactNode } from "react";
import { ChartCard, EmptyState, SectionTitle } from "./AppUi";
import { ChartCollapseToggle } from "./appUi/ChartCollapseToggle";
import { StatLabelHint } from "./appUi/StatPrimitives";
import { useCollapsedChart } from "../hooks/useCollapsedChart";

/**
 * Données quotidiennes (clé `YYYY-MM-DD` → valeur agrégée).
 * Les jours absents sont considérés comme valeur 0.
 */
export type DailyTotalsByIso = Record<string, number>;

/** Sous-totaux optionnels affichés dans le tooltip (ex. "anime" / "manga" pour la vue d'ensemble). */
export type HeatmapBreakdown = {
  key: string;
  label: string;
  unitSingular: string;
  unitPlural: string;
  values: DailyTotalsByIso;
};

export type ActivityHeatmapProps = {
  /** Année représentée par la grille (Jan 1 → Dec 31). */
  year: number;
  /** Total à afficher dans chaque cellule (et utilisé pour les buckets de couleur). */
  dailyTotals: DailyTotalsByIso;
  /** Libellé singulier de l'unité (ex. "épisode", "chapitre", "action"). */
  unitSingular: string;
  /** Libellé pluriel de l'unité. */
  unitPlural: string;
  /** Titre affiché en haut du module. */
  title: string;
  /** Si fourni : sous-totaux affichés sous la valeur principale du tooltip. */
  breakdown?: HeatmapBreakdown[];
  /** Identifiant stable pour mémoriser l'état « masqué ». Si absent, pas de bouton de collapse. */
  collapseId?: string;
  /** Texte de la bulle d'aide à droite du titre. */
  titleHint?: string;
  /** Slot libre rendu en haut à droite (ex. CTA / sélecteur). */
  titleAside?: ReactNode;
  className?: string;
  /** Empty state custom (sinon message générique). */
  emptyExtra?: ReactNode;
};

const FR_DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
const FR_MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
] as const;
const FR_LONG_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;
const FR_LONG_DAYS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

/** Index 0..6 pour Lun..Dim (semaine ISO française). */
function frDayIndex(date: Date): number {
  const jsDay = date.getDay();
  return (jsDay + 6) % 7;
}

function isoFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pluralizeFr(n: number, singular: string, plural?: string): string {
  return n > 1 ? plural || `${singular}s` : singular;
}

function formatLongDate(date: Date): string {
  return `${FR_LONG_DAYS[frDayIndex(date)]} ${date.getDate()} ${FR_LONG_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Calcule les seuils des 4 buckets non-nuls par découpage quantile sur les valeurs strictement positives.
 * Si la distribution est trop pauvre (peu de jours actifs), on retombe sur des seuils linéaires basés sur le max.
 */
function computeBucketThresholds(values: number[]): [number, number, number, number] {
  const positives = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positives.length === 0) return [1, 2, 3, 4];

  const max = positives[positives.length - 1];
  if (positives.length < 8) {
    /** Trop peu de points pour un quantile fiable : seuils linéaires sur le max. */
    return [
      Math.max(1, Math.ceil(max * 0.2)),
      Math.max(2, Math.ceil(max * 0.4)),
      Math.max(3, Math.ceil(max * 0.6)),
      Math.max(4, Math.ceil(max * 0.8)),
    ];
  }
  const q = (p: number) => positives[Math.min(positives.length - 1, Math.floor(p * positives.length))];
  return [Math.max(1, q(0.2)), Math.max(2, q(0.4)), Math.max(3, q(0.6)), Math.max(4, q(0.8))];
}

function bucketFor(value: number, thresholds: [number, number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (value < thresholds[0]) return 1;
  if (value < thresholds[1]) return 2;
  if (value < thresholds[2]) return 3;
  return 4;
}

type Cell = {
  iso: string;
  date: Date;
  value: number;
  bucket: 0 | 1 | 2 | 3 | 4;
  empty: boolean;
  weekIdx: number;
  rowIdx: number;
};

type ColumnMonthLabel = { weekIdx: number; label: string };

type HeatmapMatrix = {
  cells: Cell[];
  weeksCount: number;
  monthLabels: ColumnMonthLabel[];
  totalActiveDays: number;
  totalValue: number;
};

function buildMatrix(year: number, dailyTotals: DailyTotalsByIso): HeatmapMatrix {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const startDow = frDayIndex(start);

  const cells: Cell[] = [];

  /**
   * Colonnes de prefix : on ajoute des cellules vides du lundi de la semaine 1 jusqu'au 1er janvier
   * exclus, pour que la première vraie cellule de l'année tombe dans la bonne ligne.
   */
  for (let i = 0; i < startDow; i += 1) {
    const filler = new Date(year, 0, 1 - (startDow - i));
    cells.push({
      iso: isoFor(filler),
      date: filler,
      value: 0,
      bucket: 0,
      empty: true,
      weekIdx: 0,
      rowIdx: i,
    });
  }

  let totalActiveDays = 0;
  let totalValue = 0;
  const positives: number[] = [];
  const days: { iso: string; date: Date; value: number }[] = [];
  for (let d = new Date(year, 0, 1); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    const iso = isoFor(d);
    const value = Number(dailyTotals[iso]) || 0;
    days.push({ iso, date: new Date(d), value });
    if (value > 0) {
      totalActiveDays += 1;
      totalValue += value;
      positives.push(value);
    }
  }
  const thresholds = computeBucketThresholds(positives);

  let runningIdx = startDow;
  for (const day of days) {
    const weekIdx = Math.floor(runningIdx / 7);
    const rowIdx = runningIdx % 7;
    cells.push({
      iso: day.iso,
      date: day.date,
      value: day.value,
      bucket: bucketFor(day.value, thresholds),
      empty: false,
      weekIdx,
      rowIdx,
    });
    runningIdx += 1;
  }

  /** Suffixe : remplit jusqu'à la fin de la dernière semaine pour garder un rectangle complet. */
  const totalCells = runningIdx;
  const fullWeeks = Math.ceil(totalCells / 7);
  const padNeeded = fullWeeks * 7 - totalCells;
  for (let i = 0; i < padNeeded; i += 1) {
    const filler = new Date(year, 11, 31 + (i + 1));
    cells.push({
      iso: isoFor(filler),
      date: filler,
      value: 0,
      bucket: 0,
      empty: true,
      weekIdx: fullWeeks - 1,
      rowIdx: 7 - padNeeded + i,
    });
  }

  /** Étiquettes de mois : la 1re semaine où apparaît un nouveau mois affiche son nom. */
  const monthLabels: ColumnMonthLabel[] = [];
  let lastMonth = -1;
  for (let w = 0; w < fullWeeks; w += 1) {
    /** Cherche le premier vrai jour de cette colonne (pas une cellule de padding). */
    const colCells = cells.filter((c) => c.weekIdx === w && !c.empty);
    if (colCells.length === 0) continue;
    const firstReal = colCells[0];
    const m = firstReal.date.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ weekIdx: w, label: FR_MONTH_LABELS[m] });
      lastMonth = m;
    }
  }

  return { cells, weeksCount: fullWeeks, monthLabels, totalActiveDays, totalValue };
}

/** Couleur d'une cellule selon son bucket. */
function colorForBucket(bucket: 0 | 1 | 2 | 3 | 4): string {
  switch (bucket) {
    case 0:
      return "rgba(139, 160, 178, 0.10)";
    case 1:
      return "rgba(61, 180, 242, 0.22)";
    case 2:
      return "rgba(61, 180, 242, 0.45)";
    case 3:
      return "rgba(61, 180, 242, 0.72)";
    case 4:
      return "rgba(61, 180, 242, 0.98)";
  }
}

/** Bordure d'une cellule pour donner un peu de relief. */
function strokeForBucket(bucket: 0 | 1 | 2 | 3 | 4): string {
  if (bucket === 0) return "rgba(139, 160, 178, 0.18)";
  return "rgba(13, 22, 33, 0.55)";
}

const CELL_SIZE = 13;
const CELL_GAP = 3;
const CELL_RADIUS = 3;
const ROW_LABEL_WIDTH = 26;
const MONTH_LABEL_HEIGHT = 16;

type TooltipState = {
  visible: boolean;
  /** Coords relatives au conteneur scrollable. */
  x: number;
  y: number;
  /** Côté à dérouler le tooltip (gauche/droite). */
  side: "left" | "right";
  /** Sens vertical : `above` = au-dessus de la cellule, `below` = en-dessous. */
  vertical: "above" | "below";
  cell: Cell | null;
};

/**
 * Lignes (0=lundi … 6=dimanche) dont le tooltip s'affiche EN-DESSOUS de la cellule.
 * Pour les lignes plus basses (jeudi → dimanche), on garde le tooltip au-dessus
 * pour éviter qu'il ne sorte du conteneur (cf. footer + légende juste en dessous).
 */
const TOOLTIP_FLIP_BELOW_MAX_ROW = 2;

/**
 * Grille type « contribution calendar » façon GitHub, adaptée à l'activité
 * AniList (épisodes vus, chapitres lus, ou somme des deux).
 *
 * Points notables :
 *  - Les **seuils de couleur** (4 niveaux non-nuls) sont calculés par
 *    quantiles sur les valeurs strictement positives de l'année
 *    (`computeBucketThresholds`). Cela rend la coloration robuste à un
 *    gros binge (qui rendrait un seuil linéaire quasi uniforme) tout en
 *    gardant un seuil linéaire quand trop peu de jours sont actifs pour
 *    un quantile fiable (< 8 jours).
 *  - La **matrice** est calculée en une passe dans `buildMatrix` : on
 *    remplit d'abord le préfixe de la première semaine (jours avant le
 *    1er janvier), puis tous les jours de l'année, puis un suffixe pour
 *    compléter la dernière semaine. Cela garantit une grille rectangulaire
 *    stable quelle que soit l'année (53 ou 54 colonnes selon les cas).
 *  - Le **tooltip** est positionné dynamiquement : à gauche ou à droite
 *    selon la proximité du bord, et retourné sous la cellule uniquement
 *    pour les 3 premières rangées (lundi/mardi/mercredi), pour éviter
 *    d'être masqué par la légende / le footer situés en dessous.
 *  - Le composant est **collapsible** : si `collapseId` est fourni, l'état
 *    est persisté via `useCollapsedChart` et partagé entre instances.
 */
export function ActivityHeatmap({
  year,
  dailyTotals,
  unitSingular,
  unitPlural,
  title,
  breakdown,
  collapseId,
  titleHint,
  titleAside,
  className,
  emptyExtra,
}: ActivityHeatmapProps) {
  const collapseState = useCollapsedChart(collapseId || "");
  const collapsed = collapseId ? collapseState.collapsed : false;
  const reactId = useId();
  const bodyId = `${reactId}-body`;
  const isAllTime = year === 0;
  const matrixYear = isAllTime ? new Date().getFullYear() : year;

  const matrix = useMemo(() => buildMatrix(matrixYear, dailyTotals), [matrixYear, dailyTotals]);

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    side: "right",
    vertical: "above",
    cell: null,
  });

  const cellsByPos = useMemo(() => {
    /** Map "weekIdx:rowIdx" → Cell pour grouper les buckets dans le SVG. */
    const m = new Map<string, Cell>();
    for (const c of matrix.cells) m.set(`${c.weekIdx}:${c.rowIdx}`, c);
    return m;
  }, [matrix.cells]);

  const svgWidth = ROW_LABEL_WIDTH + matrix.weeksCount * (CELL_SIZE + CELL_GAP);
  const svgHeight = MONTH_LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP);

  const handleEnter = (cell: Cell, e: React.MouseEvent<SVGRectElement>) => {
    if (cell.empty) return;
    const target = e.currentTarget;
    /**
     * On positionne le tooltip relativement à `.activity-heatmap__body` (et NON au scroll wrapper),
     * car ce dernier a `overflow: hidden` sur l'axe Y et tronquerait le tooltip.
     * Hiérarchie : <svg> ⊂ .activity-heatmap__scroll ⊂ .activity-heatmap__body
     */
    const scrollEl = target.ownerSVGElement?.parentElement;
    const bodyEl = scrollEl?.parentElement;
    if (!bodyEl) return;
    const bodyRect = bodyEl.getBoundingClientRect();
    const cellRect = target.getBoundingClientRect();

    /** Position horizontale : centre de la cellule, relatif au body. Pas d'offset de scroll car le body ne scrolle pas. */
    const x = cellRect.left - bodyRect.left + cellRect.width / 2;
    /** Si la cellule est dans la moitié droite, on déroule le tooltip vers la gauche pour éviter le débordement. */
    const isRightHalf = cellRect.left - bodyRect.left > bodyRect.width / 2;

    /**
     * Position verticale : pour les lignes du haut (lundi → mercredi) on place le tooltip
     * en-dessous (sinon il déborde au-dessus du composant). Pour les lignes basses
     * (jeudi → dimanche) on le garde au-dessus pour ne pas couvrir la légende/footer.
     */
    const placeBelow = cell.rowIdx <= TOOLTIP_FLIP_BELOW_MAX_ROW;
    const y = placeBelow ? cellRect.bottom - bodyRect.top : cellRect.top - bodyRect.top;

    setTooltip({
      visible: true,
      x,
      y,
      side: isRightHalf ? "left" : "right",
      vertical: placeBelow ? "below" : "above",
      cell,
    });
  };

  const handleLeave = () => {
    setTooltip((t) => ({ ...t, visible: false }));
  };

  const totalsLabel = pluralizeFr(matrix.totalValue, unitSingular, unitPlural);
  const activeDaysLabel = pluralizeFr(matrix.totalActiveDays, "jour actif", "jours actifs");

  return (
    <div className={`activity-heatmap${className ? ` ${className}` : ""}`}>
      <SectionTitle
        rowClassName="list-tab-anime-chart-block__title-row"
        aside={
          <>
            {collapseId ? (
              <ChartCollapseToggle
                collapsed={collapsed}
                onToggle={collapseState.toggle}
                chartTitle={title}
                controlsId={bodyId}
              />
            ) : null}
            {titleHint ? <StatLabelHint text={titleHint} /> : null}
            {titleAside}
          </>
        }
      >
        {title}
      </SectionTitle>
      <div
        className={`collapsible-chart-animator${collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
        aria-hidden={collapsed}
      >
        <div id={collapseId ? bodyId : undefined} className="collapsible-chart-animator__inner">
          <ChartCard
            noTitle
            screenReaderSummary={`Heatmap d'activité ${isAllTime ? "All Time" : year} : ${matrix.totalActiveDays} jours actifs, ${matrix.totalValue} ${totalsLabel} au total.`}
          >
            {isAllTime ? (
              <EmptyState
                icon="calendar"
                title="Le calendrier quotidien n'est pas disponible en All Time."
                cta={emptyExtra}
              />
            ) : matrix.totalActiveDays === 0 ? (
              <EmptyState
                icon="calendar"
                title={`Aucune activité enregistrée sur l'année ${year}.`}
                cta={emptyExtra}
              />
            ) : (
              <div className="activity-heatmap__body">
                <div className="activity-heatmap__scroll">
                  <svg
                    className="activity-heatmap__svg"
                    width={svgWidth}
                    height={svgHeight}
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    role="img"
                    aria-label={`Calendrier d'activité ${year}`}
                  >
                    {/* Étiquettes de jours sur la colonne de gauche */}
                    {FR_DAY_LABELS.map((lbl, rowIdx) => {
                      /** N'affiche qu'une ligne sur deux pour éviter le bruit visuel. */
                      const visible = rowIdx === 0 || rowIdx === 2 || rowIdx === 4 || rowIdx === 6;
                      if (!visible) return null;
                      return (
                        <text
                          key={lbl}
                          x={ROW_LABEL_WIDTH - 6}
                          y={MONTH_LABEL_HEIGHT + rowIdx * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 3}
                          fontSize={10}
                          fill="rgba(139, 160, 178, 0.85)"
                          textAnchor="end"
                        >
                          {lbl}
                        </text>
                      );
                    })}

                    {/* Étiquettes de mois en haut */}
                    {matrix.monthLabels.map((m) => (
                      <text
                        key={`${m.weekIdx}-${m.label}`}
                        x={ROW_LABEL_WIDTH + m.weekIdx * (CELL_SIZE + CELL_GAP)}
                        y={MONTH_LABEL_HEIGHT - 5}
                        fontSize={10}
                        fill="rgba(139, 160, 178, 0.95)"
                      >
                        {m.label}
                      </text>
                    ))}

                    {/* Cellules */}
                    {Array.from({ length: matrix.weeksCount }).map((_, wi) =>
                      Array.from({ length: 7 }).map((__, ri) => {
                        const cell = cellsByPos.get(`${wi}:${ri}`);
                        if (!cell) return null;
                        const x = ROW_LABEL_WIDTH + wi * (CELL_SIZE + CELL_GAP);
                        const y = MONTH_LABEL_HEIGHT + ri * (CELL_SIZE + CELL_GAP);
                        return (
                          <rect
                            key={`${wi}-${ri}`}
                            x={x}
                            y={y}
                            width={CELL_SIZE}
                            height={CELL_SIZE}
                            rx={CELL_RADIUS}
                            ry={CELL_RADIUS}
                            fill={colorForBucket(cell.bucket)}
                            stroke={strokeForBucket(cell.bucket)}
                            strokeWidth={cell.empty ? 0 : 0.5}
                            opacity={cell.empty ? 0 : 1}
                            onMouseEnter={(e) => handleEnter(cell, e)}
                            onMouseLeave={handleLeave}
                            style={{ cursor: cell.empty ? "default" : "pointer" }}
                          />
                        );
                      })
                    )}
                  </svg>
                </div>

                {/*
                 * Tooltip rendu en dehors de .activity-heatmap__scroll (qui a `overflow: hidden`)
                 * pour qu'il puisse déborder verticalement au-dessus / en-dessous de la grille
                 * sans être tronqué.
                 */}
                {tooltip.visible && tooltip.cell ? (
                  <div
                    className={`activity-heatmap__tooltip activity-heatmap__tooltip--${tooltip.side} activity-heatmap__tooltip--${tooltip.vertical}`}
                    style={{ left: tooltip.x, top: tooltip.y }}
                    role="tooltip"
                  >
                    <div className="activity-heatmap__tooltip-date">{formatLongDate(tooltip.cell.date)}</div>
                    <div className="activity-heatmap__tooltip-main">
                      <strong>{tooltip.cell.value}</strong>{" "}
                      {pluralizeFr(tooltip.cell.value, unitSingular, unitPlural)}
                    </div>
                    {breakdown && breakdown.length > 0 ? (
                      <ul className="activity-heatmap__tooltip-breakdown">
                        {breakdown.map((b) => {
                          const v = Number(b.values[tooltip.cell!.iso]) || 0;
                          return (
                            <li key={b.key}>
                              <span className="activity-heatmap__tooltip-key">{b.label}</span>
                              <span className="activity-heatmap__tooltip-val">
                                {v} {pluralizeFr(v, b.unitSingular, b.unitPlural)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="activity-heatmap__footer">
                  <div className="activity-heatmap__total">
                    <strong>{matrix.totalActiveDays}</strong> {activeDaysLabel}{" · "}
                    <strong>{matrix.totalValue}</strong> {totalsLabel} sur {year}
                  </div>
                  <div className="activity-heatmap__legend" aria-hidden>
                    <span className="activity-heatmap__legend-label">Moins</span>
                    {[0, 1, 2, 3, 4].map((b) => (
                      <span
                        key={b}
                        className="activity-heatmap__legend-cell"
                        style={{
                          background: colorForBucket(b as 0 | 1 | 2 | 3 | 4),
                          borderColor: strokeForBucket(b as 0 | 1 | 2 | 3 | 4),
                        }}
                      />
                    ))}
                    <span className="activity-heatmap__legend-label">Plus</span>
                  </div>
                </div>
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
