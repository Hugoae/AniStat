import type { ReactNode } from "react";
import type { PeriodRecordsBundle } from "../../types/domain";
import { RecordCard } from "./RecordCard";
import { RecordsCarouselSection } from "./RecordsCarouselSection";

type RecordsSectionProps = {
  records: PeriodRecordsBundle;
  kind: "anime" | "manga";
};

/** Libellés qui diffèrent entre anime (épisodes vus) et manga (chapitres lus). */
const COPY = {
  anime: {
    unit: "épisode",
    biggestSessionHint: "Plus grand nombre d'épisodes vus en un seul jour de la période sélectionnée.",
    firstStartedHint: "Premier anime commencé (date startedAt la plus ancienne) durant la période sélectionnée.",
    lastStartedHint: "Dernier anime commencé (date startedAt la plus récente) durant la période sélectionnée.",
    firstActivityHint:
      "Toute première activité anime de la période (épisode vu, changement de statut, etc.), nouvelle série ou non.",
    lastActivityHint:
      "Toute dernière activité anime enregistrée sur la période, peu importe qu'il s'agisse d'une nouvelle série ou d'une série en cours.",
    mostPromisingPlannedHint: "Anime planifié avec la meilleure moyenne globale AniList. Disponible surtout en All Time.",
    longestStreakHint:
      "Plus long enchaînement de jours consécutifs avec au moins une activité (épisode vu) sur la période.",
  },
  manga: {
    unit: "chapitre",
    biggestSessionHint: "Plus grand nombre de chapitres lus en un seul jour de la période sélectionnée.",
    firstStartedHint: "Premier manga commencé (date startedAt la plus ancienne) durant la période sélectionnée.",
    lastStartedHint: "Dernier manga commencé (date startedAt la plus récente) durant la période sélectionnée.",
    firstActivityHint:
      "Toute première activité manga de la période (chapitre lu, volume complété, changement de statut), nouvelle série ou non.",
    lastActivityHint:
      "Toute dernière activité manga enregistrée sur la période, peu importe qu'il s'agisse d'une nouvelle série ou d'une série en cours.",
    mostPromisingPlannedHint: "Manga planifié avec la meilleure moyenne globale AniList. Disponible surtout en All Time.",
    longestStreakHint:
      "Plus long enchaînement de jours consécutifs avec au moins une activité (chapitre lu) sur la période.",
  },
} as const;

/**
 * Carrousel « Records & faits marquants » des onglets liste. La structure est
 * identique côté anime et manga ; seuls quelques libellés (unité : épisodes vs
 * chapitres) et identifiants varient, sélectionnés via `kind`.
 */
export function RecordsSection({ records, kind }: RecordsSectionProps) {
  const copy = COPY[kind];
  const cards: ReactNode[] = [];

  if (records.longestCompleted) {
    cards.push(
      <RecordCard
        key="longest"
        icon="trophy"
        label="Plus longue série complétée"
        value={`${records.longestCompleted.count} ${copy.unit}${records.longestCompleted.count > 1 ? "s" : ""}`}
        media={records.longestCompleted.media}
      />
    );
  }
  if (records.highestScore) {
    cards.push(
      <RecordCard
        key="high"
        icon="star"
        label="Plus haute note attribuée"
        value={`${records.highestScore.score.toFixed(1)} / 10`}
        media={records.highestScore.media}
      />
    );
  }
  if (records.lowestScore) {
    cards.push(
      <RecordCard
        key="low"
        icon="thumbs-down"
        label="Plus basse note attribuée"
        value={`${records.lowestScore.score.toFixed(1)} / 10`}
        media={records.lowestScore.media}
      />
    );
  }
  if (records.biggestSession) {
    cards.push(
      <RecordCard
        key="biggest"
        icon="bolt"
        label="Plus grosse session"
        value={`${records.biggestSession.count} ${copy.unit}${records.biggestSession.count > 1 ? "s" : ""}`}
        sub={`Le ${records.biggestSession.dateLabel}`}
        labelHint={copy.biggestSessionHint}
      />
    );
  }
  if (records.firstStarted) {
    cards.push(
      <RecordCard
        key="first"
        icon="flag"
        label="Première nouvelle série"
        value={records.firstStarted.dateLabel}
        media={records.firstStarted.media}
        labelHint={copy.firstStartedHint}
      />
    );
  }
  if (records.lastStarted) {
    cards.push(
      <RecordCard
        key="last"
        icon="check"
        label="Dernière nouvelle série"
        value={records.lastStarted.dateLabel}
        media={records.lastStarted.media}
        labelHint={copy.lastStartedHint}
      />
    );
  }
  if (records.worksStartedInPeriod) {
    const n = records.worksStartedInPeriod.count;
    cards.push(
      <RecordCard
        key="works-started"
        icon="stack"
        label="Œuvres commencées"
        value={`${n} œuvre${n > 1 ? "s" : ""}`}
        mediaStack={records.worksStartedInPeriod.spotlight.map((r) => ({
          id: r.id,
          title: r.title,
          coverImageUrl: r.coverImageUrl,
          coverColor: r.coverColor,
          anilistUrl: r.anilistUrl,
        }))}
        labelHint="Titres distincts dont la date de début sur la liste (startedAt) tombe dans la période sélectionnée. Vignettes : vos meilleures notes, sinon les meilleures moyennes AniList."
      />
    );
  }
  if (records.worksCompletedInPeriod) {
    const n = records.worksCompletedInPeriod.count;
    cards.push(
      <RecordCard
        key="works-completed"
        icon="check"
        label="Œuvres terminées"
        value={`${n} œuvre${n > 1 ? "s" : ""}`}
        mediaStack={records.worksCompletedInPeriod.spotlight.map((r) => ({
          id: r.id,
          title: r.title,
          coverImageUrl: r.coverImageUrl,
          coverColor: r.coverColor,
          anilistUrl: r.anilistUrl,
        }))}
        labelHint="Titres passés en « terminé » avec une date de complétion (completedAt) dans la période sélectionnée. Vignettes : vos meilleures notes, sinon les meilleures moyennes AniList."
      />
    );
  }
  if (records.firstActivity) {
    cards.push(
      <RecordCard
        key="first-activity"
        icon="calendar"
        label="Première activité"
        value={records.firstActivity.dateLabel}
        media={records.firstActivity.media}
        labelHint={copy.firstActivityHint}
      />
    );
  }
  if (records.lastActivity) {
    cards.push(
      <RecordCard
        key="last-activity"
        icon="clock"
        label="Dernière activité"
        value={records.lastActivity.dateLabel}
        media={records.lastActivity.media}
        labelHint={copy.lastActivityHint}
      />
    );
  }
  if (records.biggestOpinionGap) {
    const deltaSign = records.biggestOpinionGap.userScore >= records.biggestOpinionGap.averageScore ? "+" : "\u2212";
    cards.push(
      <RecordCard
        key="opinion-gap"
        icon="divide"
        label="Écart d'opinion maximal"
        value={`${deltaSign}${records.biggestOpinionGap.gap.toFixed(1)}`}
        media={{
          ...records.biggestOpinionGap.media,
          meta: `Vous ${records.biggestOpinionGap.userScore.toFixed(1)} · AniList ${records.biggestOpinionGap.averageScore.toFixed(1)}`,
        }}
        labelHint="Plus grand écart absolu entre votre note et la moyenne AniList, ramenées sur 10."
      />
    );
  }
  if (records.mostPromisingPlanned) {
    cards.push(
      <RecordCard
        key="promising-planned"
        icon="flag"
        label="Planifié le plus prometteur"
        value={`${records.mostPromisingPlanned.averageScore.toFixed(1)} / 10`}
        media={records.mostPromisingPlanned.media}
        labelHint={copy.mostPromisingPlannedHint}
      />
    );
  }
  if (records.fastestCompleted) {
    cards.push(
      <RecordCard
        key="fast"
        icon="rocket"
        label="Plus rapide à terminer"
        value={records.fastestCompleted.days === 0 ? "En 1 journée" : `${records.fastestCompleted.days} jour${records.fastestCompleted.days > 1 ? "s" : ""}`}
        media={records.fastestCompleted.media}
        labelHint="Durée la plus courte entre la date de début (startedAt) et la date de fin (completedAt)."
      />
    );
  }
  if (records.longestStreak) {
    cards.push(
      <RecordCard
        key="streak"
        icon="flame"
        label="Plus longue série de jours"
        value={`${records.longestStreak.length} jour${records.longestStreak.length > 1 ? "s" : ""}`}
        sub={
          records.longestStreak.length === 1
            ? `Le ${records.longestStreak.startDateLabel}`
            : `Du ${records.longestStreak.startDateLabel} au ${records.longestStreak.endDateLabel}`
        }
        labelHint={copy.longestStreakHint}
      />
    );
  }

  return (
    <RecordsCarouselSection
      sectionId={`${kind}-records`}
      titleId={`${kind}-records-title`}
      title="Records & faits marquants"
      cards={cards}
      collapseId={`${kind}.records`}
    />
  );
}
