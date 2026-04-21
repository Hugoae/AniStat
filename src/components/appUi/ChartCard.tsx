import { useId, type CSSProperties, type ReactNode } from "react";
import { StatLabelHint } from "./StatPrimitives";
import { SectionTitle } from "./SectionTitle";

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
        <header className="chart-card__header" aria-describedby={screenReaderSummary ? summaryId : undefined}>
          {screenReaderSummary ? (
            <p id={summaryId} className="chart-card__sr-only">
              {screenReaderSummary}
            </p>
          ) : null}
          <SectionTitle
            withHint={Boolean(titleHint)}
            aside={titleHint ? <StatLabelHint text={titleHint} /> : null}
          >
            {title}
          </SectionTitle>
        </header>
      ) : null}
      {children}
    </div>
  );
}
