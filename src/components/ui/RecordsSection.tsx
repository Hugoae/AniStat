import { useMemo, type ReactNode } from "react";
import type { PeriodRecordsBundle } from "../../types/domain";
import { useT } from "../../i18n/I18n";
import { RecordCard } from "./RecordCard";
import { RecordsCarouselSection } from "./RecordsCarouselSection";

type RecordsSectionProps = {
  records: PeriodRecordsBundle;
  kind: "anime" | "manga";
};

/**
 * Carrousel « Records & faits marquants » des onglets liste. La structure est
 * identique côté anime et manga ; seuls quelques libellés (unité : épisodes vs
 * chapitres) et identifiants varient, sélectionnés via `kind`.
 */
export function RecordsSection({ records, kind }: RecordsSectionProps) {
  const t = useT();

  const copy = useMemo(() => {
    if (kind === "anime") {
      return {
        unit: t("épisode", "episode"),
        biggestSessionHint: t(
          "Plus grand nombre d'épisodes vus en un seul jour de la période sélectionnée.",
          "Largest number of episodes watched in a single day of the selected period."
        ),
        firstStartedHint: t(
          "Premier anime commencé (date startedAt la plus ancienne) durant la période sélectionnée.",
          "First anime started (earliest startedAt date) during the selected period."
        ),
        lastStartedHint: t(
          "Dernier anime commencé (date startedAt la plus récente) durant la période sélectionnée.",
          "Latest anime started (most recent startedAt date) during the selected period."
        ),
        firstActivityHint: t(
          "Toute première activité anime de la période (épisode vu, changement de statut, etc.), nouvelle série ou non.",
          "Very first anime activity in the period (episode watched, status change, etc.), new series or not."
        ),
        lastActivityHint: t(
          "Toute dernière activité anime enregistrée sur la période, peu importe qu'il s'agisse d'une nouvelle série ou d'une série en cours.",
          "Very last anime activity recorded in the period, whether a new series or one in progress."
        ),
        mostPromisingPlannedHint: t(
          "Anime planifié avec la meilleure moyenne globale AniList. Disponible surtout en All Time.",
          "Planned anime with the best global AniList average. Mostly available in All Time."
        ),
        longestStreakHint: t(
          "Plus long enchaînement de jours consécutifs avec au moins une activité (épisode vu) sur la période.",
          "Longest streak of consecutive days with at least one activity (episode watched) in the period."
        ),
      };
    }
    return {
      unit: t("chapitre", "chapter"),
      biggestSessionHint: t(
        "Plus grand nombre de chapitres lus en un seul jour de la période sélectionnée.",
        "Largest number of chapters read in a single day of the selected period."
      ),
      firstStartedHint: t(
        "Premier manga commencé (date startedAt la plus ancienne) durant la période sélectionnée.",
        "First manga started (earliest startedAt date) during the selected period."
      ),
      lastStartedHint: t(
        "Dernier manga commencé (date startedAt la plus récente) durant la période sélectionnée.",
        "Latest manga started (most recent startedAt date) during the selected period."
      ),
      firstActivityHint: t(
        "Toute première activité manga de la période (chapitre lu, volume complété, changement de statut), nouvelle série ou non.",
        "Very first manga activity in the period (chapter read, volume completed, status change), new series or not."
      ),
      lastActivityHint: t(
        "Toute dernière activité manga enregistrée sur la période, peu importe qu'il s'agisse d'une nouvelle série ou d'une série en cours.",
        "Very last manga activity recorded in the period, whether a new series or one in progress."
      ),
      mostPromisingPlannedHint: t(
        "Manga planifié avec la meilleure moyenne globale AniList. Disponible surtout en All Time.",
        "Planned manga with the best global AniList average. Mostly available in All Time."
      ),
      longestStreakHint: t(
        "Plus long enchaînement de jours consécutifs avec au moins une activité (chapitre lu) sur la période.",
        "Longest streak of consecutive days with at least one activity (chapter read) in the period."
      ),
    };
  }, [kind, t]);

  const cards: ReactNode[] = [];

  if (records.longestCompleted) {
    cards.push(
      <RecordCard
        key="longest"
        icon="trophy"
        label={t("Plus longue série complétée", "Longest completed series")}
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
        label={t("Plus haute note attribuée", "Highest score given")}
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
        label={t("Plus basse note attribuée", "Lowest score given")}
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
        label={t("Plus grosse session", "Biggest session")}
        value={`${records.biggestSession.count} ${copy.unit}${records.biggestSession.count > 1 ? "s" : ""}`}
        sub={t(`Le ${records.biggestSession.dateLabel}`, `On ${records.biggestSession.dateLabel}`)}
        labelHint={copy.biggestSessionHint}
      />
    );
  }
  if (records.firstStarted) {
    cards.push(
      <RecordCard
        key="first"
        icon="flag"
        label={t("Première nouvelle série", "First new series")}
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
        label={t("Dernière nouvelle série", "Latest new series")}
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
        label={t("Œuvres commencées", "Titles started")}
        value={t(`${n} œuvre${n > 1 ? "s" : ""}`, `${n} title${n > 1 ? "s" : ""}`)}
        mediaStack={records.worksStartedInPeriod.spotlight.map((r) => ({
          id: r.id,
          title: r.title,
          coverImageUrl: r.coverImageUrl,
          coverColor: r.coverColor,
          anilistUrl: r.anilistUrl,
        }))}
        labelHint={t(
          "Titres distincts dont la date de début sur la liste (startedAt) tombe dans la période sélectionnée. Vignettes : vos meilleures notes, sinon les meilleures moyennes AniList.",
          "Distinct titles whose list start date (startedAt) falls in the selected period. Thumbnails: your top scores, otherwise best AniList averages."
        )}
      />
    );
  }
  if (records.worksCompletedInPeriod) {
    const n = records.worksCompletedInPeriod.count;
    cards.push(
      <RecordCard
        key="works-completed"
        icon="check"
        label={t("Œuvres terminées", "Titles completed")}
        value={t(`${n} œuvre${n > 1 ? "s" : ""}`, `${n} title${n > 1 ? "s" : ""}`)}
        mediaStack={records.worksCompletedInPeriod.spotlight.map((r) => ({
          id: r.id,
          title: r.title,
          coverImageUrl: r.coverImageUrl,
          coverColor: r.coverColor,
          anilistUrl: r.anilistUrl,
        }))}
        labelHint={t(
          "Titres passés en « terminé » avec une date de complétion (completedAt) dans la période sélectionnée. Vignettes : vos meilleures notes, sinon les meilleures moyennes AniList.",
          "Titles marked completed with a completion date (completedAt) in the selected period. Thumbnails: your top scores, otherwise best AniList averages."
        )}
      />
    );
  }
  if (records.firstActivity) {
    cards.push(
      <RecordCard
        key="first-activity"
        icon="calendar"
        label={t("Première activité", "First activity")}
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
        label={t("Dernière activité", "Last activity")}
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
        label={t("Écart d'opinion maximal", "Largest opinion gap")}
        value={`${deltaSign}${records.biggestOpinionGap.gap.toFixed(1)}`}
        media={{
          ...records.biggestOpinionGap.media,
          meta: t(
            `Vous ${records.biggestOpinionGap.userScore.toFixed(1)} · AniList ${records.biggestOpinionGap.averageScore.toFixed(1)}`,
            `You ${records.biggestOpinionGap.userScore.toFixed(1)} · AniList ${records.biggestOpinionGap.averageScore.toFixed(1)}`
          ),
        }}
        labelHint={t(
          "Plus grand écart absolu entre votre note et la moyenne AniList, ramenées sur 10.",
          "Largest absolute gap between your score and the AniList average, on a /10 scale."
        )}
      />
    );
  }
  if (records.mostPromisingPlanned) {
    cards.push(
      <RecordCard
        key="promising-planned"
        icon="flag"
        label={t("Planifié le plus prometteur", "Most promising planned")}
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
        label={t("Plus rapide à terminer", "Fastest to complete")}
        value={
          records.fastestCompleted.days === 0
            ? t("En 1 journée", "In 1 day")
            : t(
                `${records.fastestCompleted.days} jour${records.fastestCompleted.days > 1 ? "s" : ""}`,
                `${records.fastestCompleted.days} day${records.fastestCompleted.days > 1 ? "s" : ""}`
              )
        }
        media={records.fastestCompleted.media}
        labelHint={t(
          "Durée la plus courte entre la date de début (startedAt) et la date de fin (completedAt).",
          "Shortest time between start date (startedAt) and completion date (completedAt)."
        )}
      />
    );
  }
  if (records.longestStreak) {
    cards.push(
      <RecordCard
        key="streak"
        icon="flame"
        label={t("Plus longue série de jours", "Longest day streak")}
        value={t(
          `${records.longestStreak.length} jour${records.longestStreak.length > 1 ? "s" : ""}`,
          `${records.longestStreak.length} day${records.longestStreak.length > 1 ? "s" : ""}`
        )}
        sub={
          records.longestStreak.length === 1
            ? t(`Le ${records.longestStreak.startDateLabel}`, `On ${records.longestStreak.startDateLabel}`)
            : t(
                `Du ${records.longestStreak.startDateLabel} au ${records.longestStreak.endDateLabel}`,
                `From ${records.longestStreak.startDateLabel} to ${records.longestStreak.endDateLabel}`
              )
        }
        labelHint={copy.longestStreakHint}
      />
    );
  }

  return (
    <RecordsCarouselSection
      sectionId={`${kind}-records`}
      titleId={`${kind}-records-title`}
      title={t("Records & faits marquants", "Records & highlights")}
      cards={cards}
      collapseId={`${kind}.records`}
    />
  );
}
