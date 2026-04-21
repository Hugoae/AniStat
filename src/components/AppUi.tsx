export { StatCard } from "./appUi/StatPrimitives";
export { ChartCard } from "./appUi/ChartCard";
export { SectionTitle } from "./appUi/SectionTitle";
export { EmptyState } from "./appUi/EmptyState";
export { LoadingBlock } from "./appUi/LoadingBlock";
export { PeriodFloatingChip } from "./appUi/PeriodFloatingChip";
export { DevPanel } from "./appUi/DevPanel";
export { MediaCard } from "./appUi/MediaCard";
export { CTooltip, PeriodCompareLegend, CompareLineTooltip } from "./appUi/ChartTooltips";
export { MediaOriginFlagSvg } from "./appUi/MediaOriginFlagSvg";
/* Barrel file regroupant composants + quelques helpers utilisés en tandem.
 * Fast Refresh préférerait 100 % de composants, mais exposer ces deux
 * helpers évite de multiplier les imports côté consommateurs. L'impact HMR
 * est limité : ces utilitaires n'embarquent pas d'état React. */
// eslint-disable-next-line react-refresh/only-export-components
export { mediaCountryOriginMeta, mediaFormatShortLabel } from "./appUi/mediaDisplayHelpers";
