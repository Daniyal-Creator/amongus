"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLobby } from "@/lib/api";
import { setLobbyPlayerId } from "@/lib/player-session";

export default function CreateLobbyPage() {
  const router = useRouter();
  const [hostName, setHostName] = useState("Rayyan");
  const [mode, setMode] = useState("standard");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createLobby({
        hostName,
        mode,
        maxPlayers,
      });

      setLobbyPlayerId(result.lobby.code, result.playerId);
      router.push(`/lobby/${result.lobby.code}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Gagal membuat lobby.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="sky-stage flex items-center justify-center px-4 py-10">
      <div className="pixel-cloud left-[6%] top-[19%] hidden md:block" />
      <div className="pixel-cloud left-[27%] top-[35%] hidden md:block scale-75" />
      <div className="pixel-cloud right-[20%] top-[19%] hidden md:block" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <h1 className="pixel-title text-center text-3xl sm:text-5xl">CREATE LOBBY</h1>

        <form onSubmit={handleSubmit} className="pixel-panel mt-8 w-full p-5 sm:p-6">
          <div className="space-y-4">
            <label className="block">
              <span className="pixel-small">Host name</span>
              <input
                className="pixel-input mt-2"
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="pixel-small">Lobby mode</span>
              <select
                className="pixel-input mt-2"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="ranked">Ranked</option>
              </select>
            </label>
            <label className="block">
              <span className="pixel-small">Players</span>
              <select
                className="pixel-input mt-2"
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(Number(event.target.value))}
              >
                <option value={4}>4 Players</option>
                <option value={5}>5 Players</option>
              </select>
            </label>
          </div>

          {error ? (
            <p className="pixel-small mt-4 text-[color:var(--red-dark)]">{error}</p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link href="/" className="pixel-button">
              BACK
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="pixel-button pixel-button-primary"
            >
              {isSubmitting ? "CREATING..." : "CREATE"}
            </button>
          </div>
        </form>

        <p className="pixel-small mt-6 text-center text-[color:var(--text-muted)]">
          Host gets a real shareable 6-character room code from the backend.
        </p>
      </div>
    </main>
  );
}
