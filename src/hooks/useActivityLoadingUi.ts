import { useEffect, useRef, useState } from "react";
import { getRateLimitState } from "../api/anilistClient";

type Params = {
  loadingActivities: boolean;
  activityLoadingMessage: string;
  userId: number | null | undefined;
  activityYearsPendingCount: number;
};

export function useActivityLoadingUi({
  loadingActivities,
  activityLoadingMessage,
  userId,
  activityYearsPendingCount,
}: Params) {
  const [displayActivityLoadingMessage, setDisplayActivityLoadingMessage] = useState(activityLoadingMessage);
  const [activityEtaSeconds, setActivityEtaSeconds] = useState<number | null>(null);
  const loadingMessageTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingActivitiesRef = useRef(false);
  const activityEtaPhaseRef = useRef("");
  const activityEtaEndAtRef = useRef(0);
  const activityEtaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadingActivitiesRef.current = loadingActivities;
  }, [loadingActivities]);

  useEffect(() => {
    if (!loadingActivities) {
      if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
      loadingMessageTransitionRef.current = null;
      setDisplayActivityLoadingMessage(activityLoadingMessage);
      return;
    }
    if (displayActivityLoadingMessage === activityLoadingMessage) return;
    if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
    loadingMessageTransitionRef.current = setTimeout(() => {
      setDisplayActivityLoadingMessage(activityLoadingMessage);
      loadingMessageTransitionRef.current = null;
    }, 200);
  }, [activityLoadingMessage, displayActivityLoadingMessage, loadingActivities]);

  useEffect(
    () => () => {
      if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
    },
    []
  );

  useEffect(() => {
    if (activityEtaIntervalRef.current) {
      clearInterval(activityEtaIntervalRef.current);
      activityEtaIntervalRef.current = null;
    }
    if (!loadingActivities) {
      activityEtaPhaseRef.current = "";
      activityEtaEndAtRef.current = 0;
      setActivityEtaSeconds(null);
      return;
    }
    const phaseKey = `${userId ?? "0"}|${activityLoadingMessage}`;
    if (activityEtaPhaseRef.current !== phaseKey) {
      activityEtaPhaseRef.current = phaseKey;
      const rs = getRateLimitState();
      const slotMs = rs.requestIntervalMs || 2200;
      const pendingYears = Math.max(1, activityYearsPendingCount);
      const queueSlots = (rs.queued || 0) + (rs.inFlight || 0) * 2;
      const budgetMs = Math.max(
        10_000,
        (rs.blockedForMs || 0) + pendingYears * 12 * slotMs + queueSlots * slotMs + 4 * slotMs
      );
      activityEtaEndAtRef.current = Date.now() + budgetMs;
    }
    const tick = () => {
      if (!loadingActivitiesRef.current) return;
      const end = activityEtaEndAtRef.current;
      if (!end) return;
      let msLeft = end - Date.now();
      if (msLeft <= 0 && loadingActivitiesRef.current) {
        const rs = getRateLimitState();
        const slot = rs.requestIntervalMs || 2200;
        const bump = Math.max(12_000, (rs.blockedForMs || 0) + 8 * slot);
        activityEtaEndAtRef.current = Date.now() + bump;
        msLeft = bump;
      }
      setActivityEtaSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    };
    tick();
    activityEtaIntervalRef.current = setInterval(tick, 500);
    return () => {
      if (activityEtaIntervalRef.current) {
        clearInterval(activityEtaIntervalRef.current);
        activityEtaIntervalRef.current = null;
      }
    };
  }, [loadingActivities, activityLoadingMessage, userId, activityYearsPendingCount]);

  return { displayActivityLoadingMessage, activityEtaSeconds };
}
