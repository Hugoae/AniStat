import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { C } from "../../config/constants";
import { useCountUp } from "../../hooks/useCountUp";

function StatIcon({ name }: { name: string }) {
  const s = { width: 20, height: 20, display: "block" as const };
  switch (name) {
    case "play":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7L8 5z" />
        </svg>
      );
    case "tv":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="7" width="20" height="13" rx="2" />
          <path d="M17 2l-5 5-5-5" />
        </svg>
      );
    case "percent":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M19 5L5 19M9 9h.01M15 15h.01" />
        </svg>
      );
    case "spread":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 18V11M12 18V7M17 18v-9" />
        </svg>
      );
    case "divide": {
      const sd = { width: 26, height: 26, display: "block" as const };
      return (
        <svg viewBox="0 0 24 24" style={sd} fill="none" aria-hidden>
          <line
            x1="6.5"
            y1="12"
            x2="17.5"
            y2="12"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="12" cy="7.75" r="2.15" fill="currentColor" />
          <circle cx="12" cy="16.25" r="2.15" fill="currentColor" />
        </svg>
      );
    }
    case "star":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
          <path d="M12 2.5l2.6 5.3 5.8.8-4.2 4.1 1 5.7L12 15.8 6.8 18.4l1-5.7-4.2-4.1 5.8-.8L12 2.5z" />
        </svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "clock":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "stack":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      );
    case "bolt":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
      );
    case "flame":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
          <path d="M12 2c1 4 4 5 4 9a4 4 0 11-8 0c0-2 1-3 1-5 0 2 2 3 3 4 0-2-1-4 0-8z" />
        </svg>
      );
    case "trophy":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z" />
          <path d="M17 5h3v3a3 3 0 01-3 3M7 5H4v3a3 3 0 003 3" />
        </svg>
      );
    case "thumbs-down":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 15v4a2 2 0 002 2l3-7V3H6.28a2 2 0 00-2 1.7l-1.38 8a2 2 0 002 2.3H10z" />
          <path d="M19 3h-4v12h4a2 2 0 002-2V5a2 2 0 00-2-2z" />
        </svg>
      );
    case "flag":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 22V4M4 4h12l-2 4 2 4H4" />
        </svg>
      );
    case "rocket":
      return (
        <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 13l3 3M14 4c4 0 6 2 6 6l-9 9-4-4 7-7c0-2 0-4 0-4z" />
          <circle cx="15" cy="9" r="1.5" />
          <path d="M5 19c1.5-1.5 3-1.5 4 0" />
        </svg>
      );
    case "dot":
    default:
      return (
        <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

export { StatIcon };

/** Marge entre le bouton « ? » et son tooltip. */
const STAT_LABEL_HINT_TOOLTIP_GAP_PX = 8;
/** Marge minimale à conserver entre le tooltip et les bords de la viewport. */
const STAT_LABEL_HINT_VIEWPORT_MARGIN_PX = 8;

type TooltipPos = {
  /** Coordonnées en pixels relatives à la viewport (utilisées avec `position: fixed`). */
  top: number;
  left: number;
  /** Sens du tooltip par rapport au bouton, pour piloter une éventuelle classe visuelle. */
  vertical: "above" | "below";
};

/**
 * Infobulle d'aide rendue dans un portal vers `document.body` afin d'échapper
 * à tout `overflow: hidden/auto` d'un conteneur parent (ex. carrousel des records,
 * scroll horizontal, etc.). La position est calculée en `position: fixed` à partir
 * du rectangle du bouton « ? ». Bascule automatiquement en-dessous si pas assez
 * de place au-dessus dans la fenêtre.
 */
export function StatLabelHint({ text }: { text: string }) {
  const [tipOpen, setTipOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const cancelHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const openTip = useCallback(() => {
    cancelHideTimer();
    setTipOpen(true);
  }, [cancelHideTimer]);

  const scheduleCloseTip = useCallback(() => {
    cancelHideTimer();
    hideTimerRef.current = window.setTimeout(() => setTipOpen(false), 220);
  }, [cancelHideTimer]);

  useEffect(() => () => cancelHideTimer(), [cancelHideTimer]);

  /**
   * Recalcule la position du tooltip dès qu'il est affiché, après avoir laissé le
   * navigateur le mesurer (taille variable selon le texte). On utilise
   * `useLayoutEffect` pour que le repositionnement soit appliqué avant la peinture.
   */
  useLayoutEffect(() => {
    if (!tipOpen) {
      setPos(null);
      return;
    }
    const btn = btnRef.current;
    const tip = tooltipRef.current;
    if (!btn || !tip) return;

    const compute = () => {
      const btnRect = btn.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      /** Centre horizontal sur le bouton, puis clamp dans la viewport. */
      let left = btnRect.left + btnRect.width / 2 - tipRect.width / 2;
      left = Math.max(
        STAT_LABEL_HINT_VIEWPORT_MARGIN_PX,
        Math.min(left, vw - tipRect.width - STAT_LABEL_HINT_VIEWPORT_MARGIN_PX),
      );

      /** Au-dessus par défaut ; bascule en-dessous si pas assez d'espace au-dessus de la viewport. */
      const spaceAbove = btnRect.top;
      const needed = tipRect.height + STAT_LABEL_HINT_TOOLTIP_GAP_PX + STAT_LABEL_HINT_VIEWPORT_MARGIN_PX;
      const placeBelow = spaceAbove < needed && vh - btnRect.bottom > spaceAbove;
      const top = placeBelow
        ? btnRect.bottom + STAT_LABEL_HINT_TOOLTIP_GAP_PX
        : btnRect.top - tipRect.height - STAT_LABEL_HINT_TOOLTIP_GAP_PX;

      setPos({ top, left, vertical: placeBelow ? "below" : "above" });
    };

    compute();

    /**
     * Si la page scrolle ou est redimensionnée pendant que le tooltip est ouvert,
     * on le repositionne (ou le ferme si le bouton est sorti du viewport).
     */
    const onUpdate = () => compute();
    window.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    return () => {
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
    };
  }, [tipOpen, text]);

  return (
    <span className="stat-label-hint-anchor">
      <button
        ref={btnRef}
        type="button"
        className="stat-label-hint__btn"
        aria-label="Explication"
        onMouseEnter={openTip}
        onMouseLeave={scheduleCloseTip}
      >
        <span className="stat-label-hint__glyph" aria-hidden>
          ?
        </span>
      </button>
      {tipOpen
        ? createPortal(
            <div
              ref={tooltipRef}
              className={`stat-stat-al__tooltip stat-stat-al__tooltip--label stat-stat-al__tooltip--portal stat-stat-al__tooltip--open${
                pos ? ` stat-stat-al__tooltip--${pos.vertical}` : " stat-stat-al__tooltip--measuring"
              }`}
              role="tooltip"
              onMouseEnter={cancelHideTimer}
              onMouseLeave={scheduleCloseTip}
              style={
                pos
                  ? { position: "fixed", top: pos.top, left: pos.left }
                  : { position: "fixed", top: 0, left: 0, visibility: "hidden" }
              }
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

/**
 * Extrait les parties animables d'une valeur de StatCard. Retourne `null` si
 * la valeur ne peut pas être animée (texte libre, plusieurs nombres, ReactNode
 * complexe, etc.) — dans ce cas, on la rend telle quelle sans count-up.
 *
 * Accepte :
 * - un `number` fini → count-up de 0 à N, sans préfixe/suffixe ;
 * - une `string` qui matche `^(\D*)(-?\d+(?:[.,]\d+)?)(\D*)$`, avec préfixe et
 *   suffixe non numériques optionnels (ex. `"45 %"`, `"~12.3"`, `"−5.2"`). Le
 *   séparateur décimal (`.` ou `,`) est préservé dans le rendu final.
 */
type Animatable = {
  target: number;
  decimals: number;
  prefix: string;
  suffix: string;
  decimalSep: "." | ",";
};
function parseAnimatable(value: ReactNode): Animatable | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return { target: value, decimals: 0, prefix: "", suffix: "", decimalSep: "." };
  }
  if (typeof value !== "string") return null;
  const match = value.match(/^(\D*)(-?\d+)(?:([.,])(\d+))?(\D*)$/);
  if (!match) return null;
  const [, prefix, intPart, sep, decPart, suffix] = match;
  const normalized = decPart != null ? `${intPart}.${decPart}` : intPart;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return {
    target: num,
    decimals: decPart ? decPart.length : 0,
    prefix,
    suffix,
    decimalSep: sep === "," ? "," : ".",
  };
}

function formatAnimatedNumber(value: number, decimals: number, sep: "." | ","): string {
  const fixed = value.toFixed(decimals);
  return sep === "," ? fixed.replace(".", ",") : fixed;
}

function AnimatedStatValue({ spec }: { spec: Animatable }) {
  const current = useCountUp(spec.target);
  return (
    <>
      {spec.prefix}
      {formatAnimatedNumber(current, spec.decimals, spec.decimalSep)}
      {spec.suffix}
    </>
  );
}

/** label + value + icon. sub ignorée (rétrocompat). labelHint = texte d’aide au survol du « ? » à côté du libellé. */
export function StatCard({
  label,
  value,
  icon = "dot",
  sub: _sub,
  labelHint,
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  sub?: unknown;
  labelHint?: string;
}) {
  const animatable = useMemo(() => parseAnimatable(value), [value]);
  return (
    <div className="stat-stat-al">
      <div className="stat-stat-al__bubble">
        <StatIcon name={icon} />
      </div>
      <div className="stat-stat-al__text">
        <div className="stat-stat-al__value" style={{ color: C.accent }}>
          {animatable ? <AnimatedStatValue spec={animatable} /> : value}
        </div>
        <div className={`stat-stat-al__label${labelHint ? " stat-stat-al__label--with-hint" : ""}`}>
          <span className="stat-stat-al__label-text">{label}</span>
          {labelHint ? <StatLabelHint text={labelHint} /> : null}
        </div>
      </div>
    </div>
  );
}
