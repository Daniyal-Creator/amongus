"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLeaderboard,
  getCategoryLeaderboard,
  getTournamentLeaderboard,
} from "@/lib/api";
import type {
  LeaderboardSnapshot,
  CategoryLeaderboardResponse,
  LeaderboardEntry,
  TournamentEntry,
} from "@/types";

type TabId = "all" | "dsa" | "oop" | "web-dev" | "algorithms-lite" | "tournament";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "all", label: "All" },
  { id: "dsa", label: "DSA" },
  { id: "oop", label: "OOP" },
  { id: "web-dev", label: "Web Dev" },
  { id: "algorithms-lite", label: "Speedrun" },
  { id: "tournament", label: "Tournament" },
];

export function LeaderboardFilters() {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [globalData, setGlobalData] = useState<LeaderboardSnapshot | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryLeaderboardResponse | null>(null);
  const [tournamentData, setTournamentData] = useState<TournamentEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTab = useCallback(async (tab: TabId) => {
    setLoading(true);
    setError(null);
    setCategoryData(null);
    setTournamentData(null);

    try {
      if (tab === "all") {
        const data = await getLeaderboard();
        setGlobalData(data);
      } else if (tab === "tournament") {
        const data = await getTournamentLeaderboard();
        setTournamentData(data.entries);
      } else {
        const data = await getCategoryLeaderboard(tab);
        setCategoryData(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTab(activeTab);
  }, [activeTab, fetchTab]);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`pixel-tab ${activeTab === tab.id ? "pixel-tab-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="space-y-3">
          <div className="pixel-skeleton h-16 w-full" />
          <div className="pixel-skeleton h-16 w-full" />
          <div className="pixel-skeleton h-16 w-full" />
        </div>
      ) : null}

      {/* Error */}
      {error && !loading ? (
        <div className="pixel-panel p-5">
          <p className="pixel-small text-[var(--status-error-bg)]">{error}</p>
          <button
            type="button"
            onClick={() => void fetchTab(activeTab)}
            className="pixel-button mt-3 text-xs"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* All tab - original 2 column layout */}
      {!loading && !error && activeTab === "all" && globalData ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="pixel-panel p-5">
            <h2 className="text-2xl">Weekly Ranking</h2>
            <div className="mt-5 space-y-3">
              {globalData.leaderboardEntries.map((entry, index) => (
                <RankingCard key={entry.username} entry={entry} rank={index + 1} />
              ))}
              {globalData.leaderboardEntries.length === 0 ? (
                <p className="pixel-small text-[color:var(--text-muted)]">No entries yet.</p>
              ) : null}
            </div>
          </section>

          <section className="pixel-panel p-5">
            <h2 className="text-2xl">Hall of Fame</h2>
            <div className="mt-5 space-y-3">
              {globalData.hallOfFame.map((entry) => (
                <div key={entry.title} className="pixel-panel bg-[#fff8ea] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p>{entry.player}</p>
                    <span className="pixel-chip">{entry.title}</span>
                  </div>
                  <p className="pixel-small mt-2 text-[color:var(--text-muted)]">
                    {entry.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* Category tab */}
      {!loading && !error && categoryData ? (
        <section className="pixel-panel p-5">
          <h2 className="text-2xl">{categoryData.category.toUpperCase()} Ranking</h2>
          <div className="mt-5 space-y-3">
            {categoryData.entries.map((entry, index) => (
              <RankingCard key={entry.username} entry={entry} rank={index + 1} />
            ))}
            {categoryData.entries.length === 0 ? (
              <p className="pixel-small text-[color:var(--text-muted)]">No entries for this category.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Tournament tab */}
      {!loading && !error && activeTab === "tournament" && tournamentData ? (
        <section className="pixel-panel p-5">
          <h2 className="text-2xl">Tournament (7-day)</h2>
          <div className="mt-5 space-y-3">
            {tournamentData.map((entry, index) => (
              <div key={entry.player_name} className="pixel-panel bg-[#fff8ea] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p>
                      #{index + 1} {entry.player_name}
                    </p>
                    <p className="pixel-small text-[color:var(--text-muted)]">
                      W:{entry.wins} / Games:{entry.games}
                    </p>
                  </div>
                  <span className="pixel-chip pixel-chip-orange">{entry.score}</span>
                </div>
              </div>
            ))}
            {tournamentData.length === 0 ? (
              <p className="pixel-small text-[color:var(--text-muted)]">No tournament data yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RankingCard({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  return (
    <div className="pixel-panel bg-[#fff8ea] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p>
            #{rank} {entry.username}
          </p>
          <p className="pixel-small text-[color:var(--text-muted)]">{entry.category}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pixel-small text-[color:var(--text-muted)]">{entry.record}</span>
          <span className="pixel-chip pixel-chip-orange">{entry.score}</span>
        </div>
      </div>
    </div>
  );
}
