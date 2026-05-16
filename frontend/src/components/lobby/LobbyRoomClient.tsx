"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Crown, Sparkles } from "lucide-react";
import {
  getLobby,
  joinLobby,
  subscribeLobby,
  startLobby,
  toggleReady,
} from "@/lib/api";
import { getLobbyPlayerId, setLobbyPlayerId, setSessionPlayerId } from "@/lib/player-session";
import type { LobbyPlayer, LobbySnapshot } from "@/types";
import { getCharacterAsset } from "@/lib/character-assets";
import { useSounds } from "@/lib/sound-provider";
import { useToast } from "@/lib/toast-provider";
import { Check } from "lucide-react";
import { useInViewport } from "@/hooks/use-in-viewport";

type LobbyRoomClientProps = {
  code: string;
};

const MIN_PLAYERS_TO_START = 4;

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

export function LobbyRoomClient({ code }: LobbyRoomClientProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [joinName, setJoinName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [codeJustCopied, setCodeJustCopied] = useState(false);
  const [joinPassword, setJoinPassword] = useState("");
  const { play } = useSounds();
  const toast = useToast();
  const shouldReduceMotion = useReducedMotion();
  const { ref: playersListRef, isInViewport: playersListInViewport } = useInViewport<HTMLDivElement>({
    disabled: shouldReduceMotion ?? false,
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code.toUpperCase());
    } catch {
      // ignore — useless in this fallback path
    }
    play("click");
    setCodeJustCopied(true);
    toast.push({
      title: "Lobby code copied!",
      description: `${code.toUpperCase()} ready to share.`,
      tone: "success",
      icon: "📋",
      durationMs: 2000,
    });
    setTimeout(() => setCodeJustCopied(false), 1500);
  };

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

    void loadLobby();
    const unsubscribe = subscribeLobby(code, {
      onSnapshot: (lobby) => {
        if (!cancelled) {
          setSnapshot(lobby);
          setError(null);
        }
      },
      onError: () => {
        void loadLobby();
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [code]);

  const players = useMemo(() => snapshot?.players ?? [], [snapshot]);
  const hostPlayer = players.find((player) => player.isHost) ?? players[0];
  const currentPlayer =
    players.find((player) => player.id === currentUserId) ?? null;
  const isHost = currentPlayer?.isHost ?? false;
  const allNonHostReady = useMemo(
    () => players.filter((player) => !player.isHost).every((player) => player.isReady),
    [players],
  );
  const hasMinimumPlayers = players.length >= MIN_PLAYERS_TO_START;
  const canStartGame = isHost && hasMinimumPlayers && allNonHostReady && !isBusy;
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
      const result = await joinLobby(code, {
        playerName: joinName.trim(),
        password: snapshot?.isPrivate ? joinPassword : undefined,
      });
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
    if (!isHost || !hasMinimumPlayers || !allNonHostReady) {
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
    <motion.main 
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.4 }}
      className="sky-stage flex min-h-screen items-center justify-center px-4 py-10"
    >
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
                    onClick={handleCopyCode}
                    className="flex justify-center items-center h-[34px] w-[34px] bg-[#d6c3a1] text-[#5c4427] border-[3px] border-[#8a6b45] shadow-[inset_0_0_0_2px_#ebdcb8,2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-transform cursor-pointer"
                    title="Copy Code"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {codeJustCopied ? (
                        <motion.span
                          key="check"
                          initial={shouldReduceMotion ? false : { scale: 0, rotate: -90 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0, rotate: 90 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 18 }}
                        >
                          <Check className="w-4 h-4" />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="copy"
                          initial={shouldReduceMotion ? false : { scale: 0, rotate: 90 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0, rotate: -90 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 18 }}
                        >
                          <PixelCopyIcon />
                        </motion.span>
                      )}
                    </AnimatePresence>
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
                <AnimatePresence initial={false}>
                  {snapshot?.isPrivate ? (
                    <motion.input
                      key="join-password"
                      initial={shouldReduceMotion ? false : { opacity: 0, scaleY: 0.96 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.96 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                      type="password"
                      className="pixel-input origin-top text-center py-3 bg-white text-black"
                      value={joinPassword}
                      placeholder="🔒 PASSWORD"
                      onChange={(event) => setJoinPassword(event.target.value)}
                      required
                    />
                  ) : null}
                </AnimatePresence>
                <button
                  type="submit"
                  disabled={isJoining || !joinName.trim() || (snapshot?.isPrivate && !joinPassword)}
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
              <h1 className="pixel-title w-full text-center text-4xl leading-none text-white [text-shadow:4px_4px_0_#2b4a1b] sm:text-6xl">
                CODE MAFIA
              </h1>
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-black/40 px-5 py-2 border-2 border-white/10">
                <span className="pixel-small text-white/80">LOBBY CODE:</span>
                <span className="text-2xl tracking-widest text-[#a2e858] drop-shadow-md">
                  {code.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="ml-2 flex justify-center items-center h-[34px] w-[34px] bg-[#d6c3a1] text-[#5c4427] border-[3px] border-[#8a6b45] shadow-[inset_0_0_0_2px_#ebdcb8,2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-transform cursor-pointer opacity-90 hover:opacity-100"
                  title="Copy to clipboard"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {codeJustCopied ? (
                      <motion.span
                        key="check2"
                        initial={shouldReduceMotion ? false : { scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0, rotate: 90 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 18 }}
                      >
                        <Check className="w-4 h-4" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy2"
                        initial={shouldReduceMotion ? false : { scale: 0, rotate: 90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0, rotate: -90 }}
                        transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 18 }}
                      >
                        <PixelCopyIcon />
                      </motion.span>
                    )}
                  </AnimatePresence>
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
                    <span className="flex items-center gap-1"><Crown className="w-4 h-4 text-[#a2e858]" /> <span className="text-[#a2e858]">{hostPlayer.name}</span></span>
                  </span>
                ) : null}
              </div>

              <div ref={playersListRef} className="space-y-3 min-h-[160px]">
                {players.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="pixel-small text-center text-white/60 motion-safe:animate-pulse">Waiting for players...</p>
                  </div>
                ) : null}
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-stretch gap-2 ${
                      playersListInViewport ? "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" : "motion-safe:opacity-0"
                    }`}
                  >
                    {/* Left: Avatar Box */}
                    <div className="w-[72px] h-[72px] flex items-center justify-center border-[3px] border-[#5c4427] bg-[#8a6b45] shadow-[inset_0_0_8px_rgba(0,0,0,0.3)] shrink-0 relative">
                      <Image
                        src={getCharacterAsset(player.id)} 
                        alt={`Character for ${player.name}`}
                        width={52}
                        height={52}
                        style={{ imageRendering: "pixelated" }}
                        className="w-[52px] h-[52px] object-contain drop-shadow-md"
                        unoptimized
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
                  {!hasMinimumPlayers
                    ? `Need ${MIN_PLAYERS_TO_START} players to start a production match.`
                    : allNonHostReady
                    ? (
                      <span className="flex items-center justify-center gap-2">
                        <Sparkles className="w-4 h-4" /> All players ready. Host can start! <Sparkles className="w-4 h-4" />
                      </span>
                    )
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
                      disabled={!canStartGame}
                      className={`pixel-button w-full sm:w-auto text-xl py-3 font-bold tracking-wider ${
                        canStartGame
                          ? "pixel-button-primary motion-safe:animate-bounce shadow-[0_0_15px_rgba(240,169,46,0.6)]"
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
    </motion.main>
  );
}
