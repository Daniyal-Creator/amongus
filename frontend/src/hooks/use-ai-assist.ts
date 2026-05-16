"use client";

import { useCallback, useState } from "react";
import { requestSabotageSuggestion, activateCopilotPoisoning } from "@/lib/api";
import type { AiPoisoningResponse, AiSabotageSuggestResponse } from "@/types";

type UseAiAssistOptions = {
  onGhostHint?: () => void;
};

export function useAiAssist(sessionId: string, playerId: string, options?: UseAiAssistOptions) {
  const [suggestion, setSuggestion] = useState<AiSabotageSuggestResponse | null>(null);
  const [poisonResult, setPoisonResult] = useState<AiPoisoningResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghostUsed, setGhostUsed] = useState(false);
  const [poisonUsed, setPoisonUsed] = useState(false);

  const requestSuggestion = useCallback(async () => {
    if (ghostUsed) return;
    setLoading(true);
    setError(null);
    try {
      const response = await requestSabotageSuggestion(sessionId, playerId);
      setSuggestion(response);
      setGhostUsed(true);
      options?.onGhostHint?.();
    } catch (err) {
      setSuggestion(null);
      setError(err instanceof Error ? err.message : "AI service tidak tersedia.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, playerId, options, ghostUsed]);

  const activatePoison = useCallback(async () => {
    if (poisonUsed) return;
    setLoading(true);
    setError(null);
    try {
      const response = await activateCopilotPoisoning(sessionId, playerId);
      setPoisonResult(response);
      setPoisonUsed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI service tidak tersedia.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, playerId, poisonUsed]);

  return { suggestion, poisonResult, loading, error, ghostUsed, poisonUsed, requestSuggestion, activatePoison };
}
