import { useId, type CSSProperties, type ReactNode } from "react";
import { StatLabelHint } from "../ui/StatPrimitives";
import { SectionTitle } from "../ui/SectionTitle";

type ChartCardProps = {
  title?: string;
  titleHint?: string;
  screenReaderSummary?: string;
  children?: ReactNode;
  style?: CSSProperties;
  noTitle?: boolean;
  className?: string;
  dataTable?: {
    caption?: string;
    columns: string[];
    rows: Array<Array<string | number>>;
  };
};

export function ChartCard({
  title,
  titleHint,
  screenReaderSummary,
  children,
  style,
  noTitle,
  className,
  dataTable,
}: ChartCardProps) {
  const showInnerTitle = !noTitle && title;
  const base = `chart-card${noTitle ? " chart-card--no-heading" : ""}`;
  const cls = className ? `${base} ${className}` : base;
  const summaryId = useId();
  return (
    <div className={cls} style={style} aria-describedby={screenReaderSummary ? summaryId : undefined}>
      {showInnerTitle ? (
        <header className="chart-card__header">
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
      {!showInnerTitle && screenReaderSummary ? (
        <p id={summaryId} className="chart-card__sr-only">
          {screenReaderSummary}
        </p>
      ) : null}
      {children}
      {dataTable && dataTable.columns.length > 0 && dataTable.rows.length > 0 ? (
        <table className="chart-card__sr-only">
          {dataTable.caption || screenReaderSummary ? (
            <caption>{dataTable.caption || screenReaderSummary}</caption>
          ) : null}
          <thead>
            <tr>
              {dataTable.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataTable.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
