import { C, STATUS_LABELS, STATUS_COLORS } from "../config/constants";
import { StatCard, ChartCard, MediaCard } from "../components/AppUi";
import type { AniListEntry } from "../types/domain";

export type MangaTabProps = {
  mangaEntriesLength: number;
  mangaCompletedLength: number;
  totalCh: number;
  totalVol: number;
  statusCntM: Record<string, number>;
  sortedM: AniListEntry[];
};

export function MangaTab({
  mangaEntriesLength,
  mangaCompletedLength,
  totalCh,
  totalVol,
  statusCntM,
  sortedM,
}: MangaTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
        <StatCard label="Total manga" value={mangaEntriesLength} icon="book" />
        <StatCard label="Terminés" value={mangaCompletedLength} icon="check" />
        <StatCard label="Chapitres" value={totalCh} icon="book" />
        <StatCard label="Volumes" value={totalVol} icon="stack" />
      </div>
      <ChartCard title="Par statut">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {Object.entries(statusCntM).map(([s, c]) => (
            <div
              key={s}
              style={{
                background: C.bg,
                borderRadius: "var(--radius-control)",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "var(--shadow-control)",
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 700, color: STATUS_COLORS[s] || C.pink }}>{c}</span>
              <span style={{ fontSize: 13, color: C.textMuted }}>{STATUS_LABELS[s] || s}</span>
            </div>
          ))}
        </div>
      </ChartCard>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {sortedM.map((e) => (
          <MediaCard key={e.id} entry={e} type="MANGA" />
        ))}
      </div>
    </div>
  );
}
