"use client";

import { useCallback, useState } from "react";
import { executeSandbox } from "@/lib/api";
import type { SandboxRunResponse } from "@/types";

export function useSandbox(sessionId: string, playerId: string) {
  const [results, setResults] = useState<SandboxRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (stdin?: string): Promise<SandboxRunResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await executeSandbox(sessionId, playerId, stdin);
        setResults(response);
        return response;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal menjalankan kode.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [sessionId, playerId],
  );

  const reset = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return { results, loading, error, execute, reset };
}
