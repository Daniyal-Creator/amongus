"use client";

import { useCallback, useState } from "react";
import { requestSabotageSuggestion, activateCopilotPoisoning } from "@/lib/api";
import type { AiPoisoningResponse } from "@/types";

type UseAiAssistOptions = {
  onGhostHint?: () => void;
};

export function useAiAssist(sessionId: string, playerId: string, options?: UseAiAssistOptions) {
  const [poisonResult, setPoisonResult] = useState<AiPoisoningResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const requestSuggestion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await requestSabotageSuggestion(sessionId, playerId);
      setRemaining(response.remaining);
      options?.onGhostHint?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI service tidak tersedia.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, playerId, options]);

  const activatePoison = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await activateCopilotPoisoning(sessionId, playerId);
      setPoisonResult(response);
      setRemaining(response.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI service tidak tersedia.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, playerId]);

  return { poisonResult, loading, error, remaining, requestSuggestion, activatePoison };
}
