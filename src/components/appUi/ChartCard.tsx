import { useId, type CSSProperties, type ReactNode } from "react";
import { StatLabelHint } from "./StatPrimitives";

type ChartCardProps = {
  title?: string;
  titleHint?: string;
  screenReaderSummary?: string;
  children?: ReactNode;
  style?: CSSProperties;
  noTitle?: boolean;
  className?: string;
};

export function ChartCard({ title, titleHint, screenReaderSummary, children, style, noTitle, className }: ChartCardProps) {
  const showInnerTitle = !noTitle && title;
  const base = `chart-card${noTitle ? " chart-card--no-heading" : ""}`;
  const cls = className ? `${base} ${className}` : base;
  const summaryId = useId();
  return (
    <div className={cls} style={style}>
      {showInnerTitle ? (
        <header className="chart-card__header">
          {screenReaderSummary ? (
            <p id={summaryId} className="chart-card__sr-only">
              {screenReaderSummary}
            </p>
          ) : null}
          <div
            className={`chart-card__title-row${titleHint ? " chart-card__title-row--with-hint" : ""}`}
            aria-describedby={screenReaderSummary ? summaryId : undefined}
          >
            <h2 className="chart-card__title">{title}</h2>
            {titleHint ? <StatLabelHint text={titleHint} /> : null}
          </div>
        </header>
      ) : null}
      {children}
    </div>
  );
}
