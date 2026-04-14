import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { C } from "../../config/constants";

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
    case "dot":
    default:
      return (
        <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

/** Infobulle DA uniquement sur la bulle « ? » à côté du libellé (prop labelHint). */
export function StatLabelHint({ text }: { text: string }) {
  const [tipOpen, setTipOpen] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

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

  return (
    <span className="stat-label-hint-anchor">
      <button
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
      <div
        className={`stat-stat-al__tooltip stat-stat-al__tooltip--label${tipOpen ? " stat-stat-al__tooltip--open" : ""}`}
        role="tooltip"
        onMouseEnter={cancelHideTimer}
        onMouseLeave={scheduleCloseTip}
      >
        {text}
      </div>
    </span>
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
  return (
    <div className="stat-stat-al">
      <div className="stat-stat-al__bubble">
        <StatIcon name={icon} />
      </div>
      <div className="stat-stat-al__text">
        <div className="stat-stat-al__value" style={{ color: C.accent }}>{value}</div>
        <div className={`stat-stat-al__label${labelHint ? " stat-stat-al__label--with-hint" : ""}`}>
          <span className="stat-stat-al__label-text">{label}</span>
          {labelHint ? <StatLabelHint text={labelHint} /> : null}
        </div>
      </div>
    </div>
  );
}
