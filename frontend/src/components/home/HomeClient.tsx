"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function HomeClient() {
  const router = useRouter();
  const [lobbyCode, setLobbyCode] = useState("");

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = lobbyCode.trim().toUpperCase();
    if (!code) {
      return;
    }

    router.push(`/lobby/${code}`);
  }

  return (
    <main className="sky-stage flex items-center justify-center px-4 py-10">
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center">
        <div className="pixel-logo text-center">
          <p className="pixel-title text-4xl text-white [text-shadow:4px_4px_0_#2b4a1b] sm:text-6xl">CODE</p>
          <p className="mt-2 text-4xl text-[#a2e858] [text-shadow:4px_4px_0_#2b4a1b] sm:text-6xl">
            MAFIA
          </p>
          <p className="pixel-small mt-5 font-semibold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
            Sabotage or Survive
          </p>
        </div>

        <div className="mt-16 w-full max-w-[520px]">
          <Link href="/lobby/create" className="pixel-button pixel-button-primary w-full text-2xl py-6 flex justify-center mb-6 font-bold tracking-widest shadow-[0_4px_0_0_#9a6a00]">
            CREATE GAME
          </Link>

          <form
            onSubmit={handleJoin}
            className="pixel-panel w-full p-4 sm:p-5"
          >
            <span className="text-lg font-bold text-white mb-3 ml-1 block opacity-95 drop-shadow-sm tracking-wide">
              Or join a game...
            </span>
            <div className="flex gap-3 h-[60px]">
              <input
                className="pixel-input uppercase flex-1 text-center text-xl font-bold tracking-widest"
                placeholder="LOBBY ID"
                value={lobbyCode}
                onChange={(event) => setLobbyCode(event.target.value.slice(0, 6))}
              />
              <button type="submit" className="pixel-button pixel-button-success px-8 text-xl font-bold tracking-widest">
                JOIN
              </button>
            </div>
          </form>
        </div>

        <p className="pixel-small mt-7 text-center text-[color:var(--text-muted)]">
          4-5 Players • Real lobby state is now served from the backend API
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/leaderboard" className="pixel-chip">
            Leaderboard
          </Link>
        </div>
      </div>
    </main>
  );
}
