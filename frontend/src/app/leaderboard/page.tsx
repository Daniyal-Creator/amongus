"use client";

import { LeaderboardFilters } from "@/components/leaderboard/LeaderboardFilters";

export default function LeaderboardPage() {
  return (
    <main className="sky-stage flex items-center justify-center px-4 py-10">
      <div className="pixel-cloud left-[8%] top-[16%] hidden md:block" />
      <div className="pixel-cloud right-[10%] top-[20%] hidden md:block" />

      <div className="relative z-10 w-full max-w-4xl">
        <h1 className="pixel-title text-center text-3xl sm:text-5xl">LEADERBOARD</h1>
        <div className="mt-8">
          <LeaderboardFilters />
        </div>
      </div>
    </main>
  );
}
