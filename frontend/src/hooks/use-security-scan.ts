"use client";

import { useCallback, useState } from "react";
import { runSecurityScan } from "@/lib/api";
import type { SecurityScanReport } from "@/types";

export function useSecurityScan(sessionId: string, playerId: string) {
  const [report, setReport] = useState<SecurityScanReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await runSecurityScan(sessionId, playerId);
      setReport(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menjalankan security scan.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, playerId]);

  return { report, loading, error, scan };
}
