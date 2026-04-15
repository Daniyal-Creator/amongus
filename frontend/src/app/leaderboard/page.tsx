"use client";

import { useEffect, useState } from "react";
import { getLeaderboard } from "@/lib/api";
import type { LeaderboardSnapshot } from "@/types";

export default function LeaderboardPage() {
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        const nextSnapshot = await getLeaderboard();
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Gagal mengambil leaderboard.",
          );
        }
      }
    }

    void loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!snapshot && !error) {
    return (
      <main className="sky-stage flex items-center justify-center px-4 py-10">
        <div className="pixel-panel p-6">Loading leaderboard...</div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="sky-stage flex items-center justify-center px-4 py-10">
        <div className="pixel-panel p-6">{error}</div>
      </main>
    );
  }

  return (
    <main className="sky-stage flex items-center justify-center px-4 py-10">
      <div className="pixel-cloud left-[8%] top-[16%] hidden md:block" />
      <div className="pixel-cloud right-[10%] top-[20%] hidden md:block" />

      <div className="relative z-10 w-full max-w-4xl">
        <h1 className="pixel-title text-center text-3xl sm:text-5xl">LEADERBOARD</h1>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className="pixel-panel p-5">
            <h2 className="text-2xl">Weekly Ranking</h2>
            <div className="mt-5 space-y-3">
              {snapshot.leaderboardEntries.map((entry, index) => (
                <div key={entry.username} className="pixel-panel bg-[#fff8ea] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p>#{index + 1} {entry.username}</p>
                      <p className="pixel-small text-[color:var(--text-muted)]">{entry.category}</p>
                    </div>
                    <span className="pixel-chip pixel-chip-orange">{entry.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pixel-panel p-5">
            <h2 className="text-2xl">Hall of Fame</h2>
            <div className="mt-5 space-y-3">
              {snapshot.hallOfFame.map((entry) => (
                <div key={entry.title} className="pixel-panel bg-[#fff8ea] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p>{entry.player}</p>
                    <span className="pixel-chip">{entry.title}</span>
                  </div>
                  <p className="pixel-small mt-2 text-[color:var(--text-muted)]">{entry.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
