"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getLobby,
  getLobbyWebSocketUrl,
  joinLobby,
  startLobby,
  toggleReady,
} from "@/lib/api";
import { getLobbyPlayerId, setLobbyPlayerId, setSessionPlayerId } from "@/lib/player-session";
import type { CategoryOption, LobbyPlayer, LobbySnapshot } from "@/types";

type LobbyRoomClientProps = {
  code: string;
};

const PixelCopyIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4 4H16V8H20V20H8V16H4V4ZM6 6V14H8V8H14V6H6ZM10 10V18H18V10H10Z"
    />
  </svg>
);

const CHARACTER_ASSETS = [
  "character-base.gif",
  "character-dude.gif",
  "character-helmet.gif",
  "character-knight.gif",
  "character-orc.gif",
];

function getCharacterAsset(playerId: string) {
  const sum = Array.from(playerId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const name = CHARACTER_ASSETS[sum % CHARACTER_ASSETS.length];
  return `/Char/${name}`;
}

export function LobbyRoomClient({ code }: LobbyRoomClientProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [joinName, setJoinName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const storedName = window.localStorage.getItem("code-mafia:pending-player-name");
    if (storedName) {
      setJoinName(storedName);
    }
  }, []);

  useEffect(() => {
    const storedPlayerId = getLobbyPlayerId(code);
    if (storedPlayerId) {
      setCurrentUserId(storedPlayerId);
    }

    let cancelled = false;
    let websocket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    async function loadLobby() {
      try {
        const lobby = await getLobby(code);
        if (!cancelled) {
          setSnapshot(lobby);
          setError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Gagal mengambil lobby.",
          );
        }
      }
    }

    function connect() {
      websocket = new window.WebSocket(getLobbyWebSocketUrl(code));
      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data) as {
          type: "lobby.updated";
          payload: LobbySnapshot | null;
        };

        if (!cancelled && message.type === "lobby.updated" && message.payload) {
          setSnapshot(message.payload);
          setError(null);
        }
      };
      websocket.onerror = () => {
        void loadLobby();
      };
      websocket.onclose = () => {
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    }

    void loadLobby();
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      websocket?.close();
    };
  }, [code]);

  const players = useMemo(() => snapshot?.players ?? [], [snapshot]);
  const categoryOptions: CategoryOption[] = useMemo(
    () => snapshot?.categories ?? [],
    [snapshot],
  );
  const hostPlayer = players.find((player) => player.isHost) ?? players[0];
  const currentPlayer =
    players.find((player) => player.id === currentUserId) ?? null;
  const isHost = currentPlayer?.isHost ?? false;
  const allNonHostReady = useMemo(
    () => players.filter((player) => !player.isHost).every((player) => player.isReady),
    [players],
  );
  const needsJoin = !currentUserId || !currentPlayer;

  async function refreshLobby() {
    const lobby = await getLobby(code);
    setSnapshot(lobby);
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsJoining(true);
    setError(null);

    try {
      const result = await joinLobby(code, { playerName: joinName.trim() });
      setLobbyPlayerId(code, result.playerId);
      setCurrentUserId(result.playerId);
      await refreshLobby();
      window.localStorage.removeItem("code-mafia:pending-player-name");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Gagal join lobby.");
    } finally {
      setIsJoining(false);
    }
  }

  async function handleToggleReady(player: LobbyPlayer) {
    if (!currentUserId || player.id !== currentUserId || player.isHost) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const lobby = await toggleReady(code, currentUserId);
      setSnapshot(lobby);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Gagal ubah status ready.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStart() {
    if (!isHost || !allNonHostReady) {
      return;
    }

    if (!currentUserId) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await startLobby(code, currentUserId);
      setSessionPlayerId(result.sessionId, currentUserId);
      router.push(`/game/${result.sessionId}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Gagal memulai game.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    if (snapshot?.activeSessionId && currentUserId) {
      setSessionPlayerId(snapshot.activeSessionId, currentUserId);
      router.replace(`/game/${snapshot.activeSessionId}`);
    }
  }, [currentUserId, router, snapshot?.activeSessionId]);

  if (!snapshot && !error) {
    return (
      <main className="sky-stage flex items-center justify-center px-4 py-10">
        <div className="pixel-panel p-6">Loading lobby...</div>
      </main>
    );
  }

  return (
    <main className="sky-stage flex min-h-screen items-center justify-center px-4 py-10">
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
        {needsJoin ? (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <h1 className="pixel-title mb-8 text-center text-5xl text-white [text-shadow:4px_4px_0_#2b4a1b] sm:text-6xl">
              JOIN LOBBY
            </h1>
            <div className="pixel-panel p-6 sm:p-8">
              <div className="mb-6 flex flex-col items-center gap-2 border-b-4 border-[color:var(--brown-dark)] pb-6 text-center">
                <span className="pixel-small text-white">Lobby Code</span>
                <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-lg">
                  <span className="text-3xl tracking-widest text-[#a2e858] drop-shadow-md">
                    {code.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(code.toUpperCase())}
                    className="flex justify-center items-center h-[34px] w-[34px] bg-[#d6c3a1] text-[#5c4427] border-[3px] border-[#8a6b45] shadow-[inset_0_0_0_2px_#ebdcb8,2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all cursor-pointer"
                    title="Copy Code"
                  >
                    <PixelCopyIcon />
                  </button>
                </div>
              </div>

              <form onSubmit={handleJoin} className="flex flex-col gap-4">
                <input
                  className="pixel-input text-2xl text-center font-bold tracking-widest py-3 bg-white text-black"
                  value={joinName}
                  placeholder="PLAYER NAME"
                  onChange={(event) => setJoinName(event.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isJoining || !joinName.trim()}
                  className="pixel-button pixel-button-primary mt-4 w-full text-xl py-3"
                >
                  {isJoining ? "JOINING..." : "ENTER LOBBY"}
                </button>
              </form>
            </div>
            {error ? (
              <p className="pixel-small mt-6 text-center text-[#ff8b81] drop-shadow-md">{error}</p>
            ) : null}
          </div>
        ) : (
          <div className="w-full max-w-lg animate-in slide-in-from-bottom-4 duration-300">
            <div className="mb-6 flex flex-col items-center">
              <h1 className="pixel-title whitespace-nowrap text-4xl text-white [text-shadow:4px_4px_0_#2b4a1b] sm:text-5xl">
                WAITING LIST
              </h1>
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-black/40 px-5 py-2 border-2 border-white/10">
                <span className="pixel-small text-white/80">LOBBY CODE:</span>
                <span className="text-2xl tracking-widest text-[#a2e858] drop-shadow-md">
                  {code.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(code.toUpperCase())}
                  className="ml-2 flex justify-center items-center h-[34px] w-[34px] bg-[#d6c3a1] text-[#5c4427] border-[3px] border-[#8a6b45] shadow-[inset_0_0_0_2px_#ebdcb8,2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all cursor-pointer opacity-90 hover:opacity-100"
                  title="Copy to clipboard"
                >
                  <PixelCopyIcon />
                </button>
              </div>
            </div>

            <section className="pixel-panel p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between border-b-4 border-[color:var(--brown-dark)] pb-5">
                <h2 className="text-2xl text-white drop-shadow-md">
                  Players ({players.length}/{snapshot?.maxPlayers ?? 0})
                </h2>
                {hostPlayer ? (
                  <span className="pixel-small text-white/80 border-2 border-[color:var(--brown-dark)] bg-[color:var(--brown)] px-2 py-1">
                    👑 <span className="text-[#a2e858]">{hostPlayer.name}</span>
                  </span>
                ) : null}
              </div>

              <div className="space-y-3 min-h-[160px]">
                {players.length === 0 ? (
                  <div className="flex h-full items-center justify-center border-4 border-[#5c4427] bg-[#8a6b45]">
                    <p className="pixel-small text-center text-white/60 animate-pulse">Waiting for players...</p>
                  </div>
                ) : null}
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-stretch gap-2 animate-in fade-in duration-200"
                  >
                    {/* Left: Avatar Box */}
                    <div className="w-[72px] h-[72px] flex items-center justify-center border-[3px] border-[#5c4427] bg-[#8a6b45] shadow-[inset_0_0_8px_rgba(0,0,0,0.3)] shrink-0 relative">
                      <img 
                        src={getCharacterAsset(player.id)} 
                        alt={`Character for ${player.name}`}
                        style={{ imageRendering: "pixelated" }}
                        className="w-[52px] h-[52px] object-contain drop-shadow-md"
                      />
                      <div className="absolute top-1 left-1 w-2 h-2 border-[1px] border-black/50 shadow-sm" style={{ backgroundColor: player.color }} title="Team Color" />
                    </div>

                    {/* Right: Info Box (Paper style) */}
                    <div className="flex-1 relative flex items-center justify-between bg-[#ebdcb8] border-y-[3px] border-[#8a6b45] px-5 py-2 shadow-[0_2px_0_rgba(0,0,0,0.1)]">
                      {/* Corner pins */}
                      <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-[#8a6b45] rounded-xs" />
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#8a6b45] rounded-xs" />
                      <div className="absolute bottom-1 left-1 w-1.5 h-1.5 bg-[#8a6b45] rounded-xs" />
                      <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#8a6b45] rounded-xs" />

                      <div className="flex flex-col">
                        <p className="pixel-small text-xl text-[#5c4427]">
                          {player.name}
                          {player.id === currentUserId ? (
                            <span className="text-[#59a63c] ml-2 [text-shadow:1px_1px_0_white]">(You)</span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {player.isHost ? (
                          <span className="bg-[#5c4427] px-3 py-1 font-mono text-sm font-bold text-[#ebdcb8] shadow-[inset_0_-2px_0_rgba(0,0,0,0.3)]">HOST</span>
                        ) : (
                          <span
                            className={`px-3 py-1 font-mono text-sm font-bold shadow-[inset_0_-2px_0_rgba(0,0,0,0.3)] ${
                              player.isReady ? "bg-[#59a63c] text-white" : "bg-[#a8987b] text-[#5c4427]"
                            }`}
                          >
                            {player.isReady ? "READY" : "WAITING"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-4 border-t-4 border-[color:var(--brown-dark)] pt-6">
                <p className="pixel-small text-center text-white/90">
                  {allNonHostReady
                    ? "✨ All players ready. Host can start! ✨"
                    : "Waiting for all non-host players to be ready..."}
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center mt-2">
                  {!isHost ? (
                    <button
                      type="button"
                      onClick={() => currentPlayer ? handleToggleReady(currentPlayer) : undefined}
                      disabled={!currentPlayer || currentPlayer.isHost || isBusy}
                      className={`pixel-button w-full sm:w-auto text-xl py-3 ${currentPlayer?.isReady ? 'bg-[#df4c43] shadow-[inset_0_0_0_4px_#ff8b81,0_4px_0_0_rgba(0,0,0,0.2)]' : 'pixel-button-success'}`}
                    >
                      {currentPlayer?.isReady ? "CANCEL READY" : "READY UP!"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStart}
                      disabled={!allNonHostReady || isBusy}
                      className={`pixel-button w-full sm:w-auto text-xl py-3 font-bold tracking-wider ${
                        allNonHostReady
                          ? "pixel-button-primary animate-bounce shadow-[0_0_15px_rgba(240,169,46,0.6)]"
                          : "opacity-60 cursor-not-allowed bg-[#7a6f5e] shadow-none border-[#4f4435]"
                      }`}
                    >
                      {isBusy ? "WORKING..." : "START GAME"}
                    </button>
                  )}
                </div>
              </div>
            </section>
            
            {error ? (
              <p className="pixel-small mt-6 text-center text-[#ff8b81] drop-shadow-md bg-black/40 py-2 rounded-lg">{error}</p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
