"use client";

import { useCallback, useMemo, useRef } from "react";
import type { CursorPresence } from "@/types";
import type { SessionConnection } from "@/lib/api";

type ConnectionLike = Pick<SessionConnection, "send"> | null;

export function useCursorPresence(
  connectionRef: { current: ConnectionLike },
  cursors: CursorPresence[],
  currentPlayerId: string,
) {
  const timerRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ anchor: number; head: number } | null>(null);

  const remoteCursors = useMemo(
    () => cursors.filter((c) => c.playerId !== currentPlayerId),
    [cursors, currentPlayerId],
  );

  const sendCursorPosition = useCallback(
    (anchor: number, head: number) => {
      if (!connectionRef.current) return;
      if (
        lastSentRef.current &&
        lastSentRef.current.anchor === anchor &&
        lastSentRef.current.head === head
      ) {
        return;
      }

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        connectionRef.current?.send({ type: "editor.cursor", anchor, head });
        lastSentRef.current = { anchor, head };
        timerRef.current = null;
      }, 50);
    },
    [connectionRef],
  );

  return { remoteCursors, sendCursorPosition };
}
