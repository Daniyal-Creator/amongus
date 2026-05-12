"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, Shield, Sword, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { connectSession, getSession, type SessionRealtimeMessage } from "@/lib/api";
import { getSessionPlayerId } from "@/lib/player-session";
import type { CursorPresence, GameSnapshot } from "@/types";
import { getCharacterAsset } from "@/lib/character-assets";
import { useCursorPresence } from "@/hooks/use-cursor-presence";
import { SandboxPanel } from "@/components/game/panels/SandboxPanel";
import { SecurityPanel } from "@/components/game/panels/SecurityPanel";
import { AiAssistPanel } from "@/components/game/panels/AiAssistPanel";
import { GameReviewPanel } from "@/components/game/panels/GameReviewPanel";

const CodeEditor = dynamic(
  () => import("@/components/editor/CodeEditor").then((m) => m.CodeEditor),
  { ssr: false, loading: () => <div className="h-full bg-[#1f2033] animate-pulse" /> },
);

type GameSessionClientProps = {
  sessionId: string;
};

export function GameSessionClient({ sessionId }: GameSessionClientProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [cursors, setCursors] = useState<CursorPresence[]>([]);
  const sessionConnectionRef = useRef<ReturnType<typeof connectSession> | null>(null);
  const editorSyncTimerRef = useRef<number | null>(null);
  const pendingEditorContentRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [roleRevealStage, setRoleRevealStage] = useState<"hidden" | "assigning" | "revealed">("hidden");
  const hasShownRoleRef = useRef(false);
  const [ghostToast, setGhostToast] = useState(false);
  const ghostToastTimerRef = useRef<number | null>(null);

  const handleGhostHint = useCallback(() => {
    setGhostToast(true);
    if (ghostToastTimerRef.current !== null) {
      window.clearTimeout(ghostToastTimerRef.current);
    }
    ghostToastTimerRef.current = window.setTimeout(() => {
      setGhostToast(false);
      ghostToastTimerRef.current = null;
    }, 4000);
  }, []);

  const playerId = typeof window !== "undefined" ? getSessionPlayerId(sessionId) : null;

  const { remoteCursors, sendCursorPosition } = useCursorPresence(
    sessionConnectionRef,
    cursors,
    playerId ?? "",
  );

  useEffect(() => {
    const pid = getSessionPlayerId(sessionId);
    let cancelled = false;

    async function loadSession() {
      try {
        const nextSnapshot = await getSession(sessionId, pid ?? undefined);
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setEditorContent(nextSnapshot.editorContent);
          pendingEditorContentRef.current = null;
          setLoadError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setLoadError(
            caughtError instanceof Error ? caughtError.message : "Gagal mengambil session.",
          );
        }
      }
    }

    void loadSession();
    sessionConnectionRef.current = connectSession(sessionId, pid ?? undefined, {
      onSnapshot: (nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          if (pendingEditorContentRef.current === nextSnapshot.editorContent) {
            pendingEditorContentRef.current = null;
            setEditorContent(nextSnapshot.editorContent);
          } else if (pendingEditorContentRef.current === null) {
            setEditorContent(nextSnapshot.editorContent);
          }
          setLoadError(null);
        }
      },
      onCursors: (nextCursors) => {
        if (!cancelled) {
          setCursors(nextCursors);
        }
      },
      onError: () => {
        void loadSession();
      },
    });

    return () => {
      cancelled = true;
      if (editorSyncTimerRef.current !== null) {
        window.clearTimeout(editorSyncTimerRef.current);
      }
      if (ghostToastTimerRef.current !== null) {
        window.clearTimeout(ghostToastTimerRef.current);
      }
      sessionConnectionRef.current?.close();
      sessionConnectionRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [snapshot?.chatMessages.length]);

  useEffect(() => {
    if (snapshot?.phase === "playing" && !hasShownRoleRef.current) {
      hasShownRoleRef.current = true;
      const t0 = setTimeout(() => {
        setRoleRevealStage("assigning");
      }, 0);
      const t1 = setTimeout(() => {
        setRoleRevealStage("revealed");
      }, 2500);
      const t2 = setTimeout(() => {
        setRoleRevealStage("hidden");
      }, 5500);
      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [snapshot?.phase]);

  function sendRealtimeMessage(payload: SessionRealtimeMessage) {
    const connection = sessionConnectionRef.current;
    if (!connection) {
      return;
    }

    connection.send(payload);
  }

  function handleEditorChange(nextValue: string) {
    pendingEditorContentRef.current = nextValue;

    if (editorSyncTimerRef.current !== null) {
      window.clearTimeout(editorSyncTimerRef.current);
    }

    editorSyncTimerRef.current = window.setTimeout(() => {
      sendRealtimeMessage({
        type: "editor.update",
        content: nextValue,
      });
    }, 300);
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message) {
      return;
    }

    sendRealtimeMessage({
      type: "chat.send",
      message,
    });
    setChatDraft("");
  }

  if (!snapshot && !loadError) {
    return (
      <main className="sky-stage flex items-center justify-center px-4 py-10">
        <div className="pixel-panel p-6">Loading session...</div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="sky-stage flex items-center justify-center px-4 py-10">
        <div className="pixel-panel p-6 text-center">
          <p>{loadError ?? "Session tidak tersedia."}</p>
        </div>
      </main>
    );
  }

  const isCivilian = snapshot.currentUser.role === "civilian";
  const roleLabel = isCivilian ? "CIVILIAN" : "IMPOSTER";
  const sideTitle = isCivilian ? "Test Cases" : "Sabotage Tasks";
  const sideCount = isCivilian ? `(${snapshot.objectives.filter(o => o.done).length}/${snapshot.objectives.length})` : `(${snapshot.sabotageCharges}/5)`;
  const sidebarItems = isCivilian ? snapshot.objectives : snapshot.imposterObjectives;
  const editorHeaderTone = isCivilian ? "pixel-chip-orange" : "pixel-chip-red";
  const rightPanelTitle = isCivilian ? "Chat" : "Covert Feed + Chat";

  function parseTimestampToMinutes(ts: string): number {
    const [h, m] = ts.split(".").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }

  const rightMessages = isCivilian
    ? snapshot.chatMessages
    : [...snapshot.imposterFeed, ...snapshot.chatMessages].sort(
        (a, b) => parseTimestampToMinutes(a.timestamp) - parseTimestampToMinutes(b.timestamp),
      );
  const editorLang = snapshot.challenge.language || "javascript";
  const timeSeconds = parseInt(snapshot.timeRemaining.replace(/s$/, ""), 10);
  const displayTime = `${timeSeconds}s`;
  const timerIsLow = !isNaN(timeSeconds) && timeSeconds <= 5;

  function handlePrimaryAction() {
    if (isCivilian) {
      sendRealtimeMessage({ type: "meeting.start" });
      return;
    }

    if (snapshot!.sabotageCharges <= 0) {
      return;
    }

    sendRealtimeMessage({ type: "sabotage.use" });
  }

  return (
    <>
      <main className="min-h-screen bg-[url('/background/nature_2/origbig.png')] bg-cover bg-center bg-no-repeat bg-fixed px-3 py-3 text-white sm:px-5">
        <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1800px] flex-col">
          {/* Header bar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`pixel-chip ${editorHeaderTone}`}>
                Round {snapshot.round}/{snapshot.maxRounds}
              </span>
              <span className="pixel-small">{snapshot.category}</span>
              {snapshot.phase === "playing" ? (
                <span
                  className={`pixel-chip ${isCivilian ? "pixel-chip-green" : "pixel-chip-red"}`}
                >
                  {roleLabel}
                </span>
              ) : null}
              {snapshot.phase === "meeting" ? <span className="pixel-chip">MEETING</span> : null}
            </div>
            <div className="bg-white/10 rounded-xl border border-white/20 px-4 py-2 text-2xl font-bold tracking-widest">{snapshot.timeRemaining}</div>
          </div>

          {/* Main 3-column layout */}
          <section className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px] xl:grid-rows-[1fr]">
            {/* Left sidebar: players + objectives + feature panels */}
            <aside className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-5 xl:overflow-y-auto flex flex-col gap-5 shadow-lg">
              <h2 className="text-2xl font-bold tracking-wider text-white/90 drop-shadow-sm">Players</h2>
              <div className="mt-4 space-y-2">
                {snapshot.players.map((player) => (
                  <div key={player.id} className="flex items-center gap-3">
                    <div className="w-[36px] h-[36px] flex items-center justify-center border-[2px] border-[#5c4427] bg-[#8a6b45] shadow-[inset_0_0_4px_rgba(0,0,0,0.3)] shrink-0 relative">
                      <Image
                        src={getCharacterAsset(player.id)}
                        alt={player.name}
                        width={24}
                        height={24}
                        style={{ imageRendering: "pixelated" }}
                        className="w-[24px] h-[24px] object-contain drop-shadow-md"
                        unoptimized
                      />
                      <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 border-[1px] border-black/50 shadow-sm" style={{ backgroundColor: player.color }} title="Team Color" />
                    </div>
                    <span
                      className={`text-base leading-tight ${
                        player.id === snapshot.currentUser.id ? "text-[color:var(--red)]" : ""
                      } ${player.status?.includes("ejected") ? "line-through opacity-50" : ""}`}
                    >
                      {player.name}
                      {player.id === snapshot.currentUser.id ? " (You)" : ""}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-2">
                <h3 className="text-xl font-bold tracking-wider text-white/90 drop-shadow-sm">{sideTitle}</h3>
                <p className="mt-1 text-sm text-white/70">{sideCount}</p>
                <div className="mt-3 space-y-2">
                  {sidebarItems.map((objective) => (
                    <div
                      key={objective.title}
                      className={`px-3 py-2 rounded-xl border border-white/10 ${objective.done ? "bg-[#9ed46c]/30 border-[#9ed46c]/50" : "bg-white/5"}`}
                    >
                      <p className="pixel-small text-white/90">{objective.title}</p>
                    </div>
                  ))}
                </div>
                <p className="pixel-small mt-4 text-white/60">
                  {isCivilian
                    ? "Call emergency meeting if you see something sus."
                    : `${snapshot.sabotageCharges} charges left. Use wisely.`}
                </p>
              </div>

              {/* Security Scanner (civilians) or AI Assist (imposters) */}
              <SecurityPanel
                sessionId={sessionId}
                playerId={playerId ?? ""}
                phase={snapshot.phase}
                isCivilian={isCivilian}
              />
              {!isCivilian ? (
                <AiAssistPanel
                  sessionId={sessionId}
                  playerId={playerId ?? ""}
                  phase={snapshot.phase}
                  onGhostHint={handleGhostHint}
                />
              ) : null}
            </aside>

            {/* Center: Code Editor + Sandbox */}
            <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col h-full overflow-hidden shadow-lg">
              {/* Challenge header */}
              <div className="border-b border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="pixel-small text-[#a2e858]">{snapshot.challenge.title}</span>
                  <span className="pixel-chip text-[10px]">{editorLang}</span>
                </div>
                <span className="pixel-chip pixel-chip-orange text-[10px]">{snapshot.challenge.difficulty}</span>
              </div>

              {/* CodeMirror Editor */}
              <div className="flex-1 bg-[#1f2033]" style={{ minHeight: 0 }}>
                <CodeEditor
                  value={editorContent}
                  language={editorLang}
                  disabled={snapshot.phase !== "playing"}
                  onChange={handleEditorChange}
                  onCursorActivity={sendCursorPosition}
                  remoteCursors={remoteCursors}
                />
              </div>

              {/* Sandbox action bar + results */}
              <SandboxPanel
                sessionId={sessionId}
                playerId={playerId ?? ""}
                phase={snapshot.phase}
                description={snapshot.challenge.description}
                isCivilian={isCivilian}
                sabotageCharges={snapshot.sabotageCharges}
                onPrimaryAction={handlePrimaryAction}
              />
            </div>

            {/* Right sidebar: Chat */}
            <aside className="grid h-full grid-rows-[1fr_auto] overflow-hidden bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg">
              <div className="flex flex-col h-full">
                <div className="border-b border-white/10 bg-white/5 px-4 py-3 text-center text-base xl:text-lg shrink-0 leading-tight font-bold tracking-wider text-white/90 drop-shadow-sm">
                  {rightPanelTitle}
                </div>
                <div className="p-3 flex-1 overflow-y-auto">
                  {rightMessages.length === 0 ? (
                    <p className="pixel-small text-center text-[color:var(--text-muted)]">
                      No messages yet...
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {rightMessages.map((message, idx) => (
                        <div key={`${message.user}-${message.timestamp}-${idx}`} className="pixel-small">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: message.color }}
                            />
                            <span className="font-semibold" style={{ color: message.color }}>
                              {message.user}
                            </span>
                            <span className="text-[color:var(--text-muted)] text-[10px]">{message.timestamp}</span>
                          </div>
                          <p className="mt-0.5 ml-[18px] text-[color:var(--text-muted)]">{message.message}</p>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-white/10 bg-white/5 p-3">
                <form onSubmit={handleChatSubmit} className="grid grid-cols-[1fr_42px] gap-2">
                  <input
                    className="pixel-input min-h-[40px] text-xs px-3 bg-black/40 border-white/20 text-white placeholder-white/40 rounded-lg"
                    placeholder={isCivilian ? "Type a message..." : "Covert message..."}
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                  />
                  <button type="submit" className="pixel-button pixel-button-primary px-0 flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </aside>
          </section>
        </section>
      </main>

      {/* Category Vote Overlay */}
      <AnimatePresence>
      {snapshot.phase === "category" ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[url('/background/nature_2/origbig.png')] bg-cover bg-center bg-no-repeat px-4 text-center before:absolute before:inset-0 before:bg-black/40 before:backdrop-blur-sm"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300, delay: 0.1 }}
            className="w-full max-w-7xl relative z-10"
          >
            <p className="pixel-title text-4xl sm:text-6xl drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] text-white">VOTE CATEGORY</p>
            <p className="pixel-small mt-3 text-white/80 drop-shadow-md">Round {snapshot.round} of {snapshot.maxRounds}</p>
            <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-3xl mt-6 w-full p-6 sm:p-8 shadow-2xl">
              {/* Header row */}
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="text-left">
                  <p className="text-2xl font-bold tracking-wider text-white">Choose challenge type</p>
                  <p className="pixel-small mt-1 text-white/60">
                    Pilih dalam 10 detik. Jika seri, challenge akan diacak.
                  </p>
                </div>
                <motion.div 
                  animate={timerIsLow ? { scale: [1, 1.15, 1] } : {}}
                  transition={timerIsLow ? { repeat: Infinity, duration: 0.8, ease: "easeInOut" } : {}}
                  className={`rounded-xl min-w-[90px] px-4 py-2 text-center text-3xl font-bold tracking-widest shadow-inner ${
                    timerIsLow 
                      ? "bg-red-500/20 border border-red-500/50 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" 
                      : "bg-white/10 border border-white/20 text-white"
                  }`}
                >
                  {displayTime}
                </motion.div>
              </div>
              {/* 4-column landscape grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {snapshot.categoryVoteOptions.map((category) => (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    key={category.slug}
                    type="button"
                    onClick={() =>
                      sendRealtimeMessage({
                        type: "category.vote",
                        categorySlug: category.slug,
                      })
                    }
                    className={`flex flex-col px-5 py-4 text-left transition-all rounded-2xl border ${
                      snapshot.currentCategoryVote === category.slug ? "bg-white/20 border-white/50 shadow-[0_0_15px_rgba(255,255,255,0.2)]" : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="pixel-small font-bold text-white text-lg tracking-wide">{category.name}</span>
                      <span className="bg-[#a2e858] text-black px-2 py-0.5 rounded-md font-bold text-sm shrink-0">{category.votes}</span>
                    </div>
                    <span className="pixel-small mt-3 text-white/70 text-xs leading-relaxed">
                      {category.description}
                    </span>
                  </motion.button>
                ))}
              </div>
              <p className="pixel-small mt-6 text-white/50">
                Jika tidak semua pemain vote sampai timer habis, kategori dengan vote terbanyak yang dipilih.
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>

      {/* Emergency Meeting Overlay */}
      <AnimatePresence>
      {snapshot.phase === "meeting" ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[url('/background/nature_2/origbig.png')] bg-cover bg-center px-4 py-6 text-[#39404f] overflow-y-auto"
        >
          {/* Dark overlay for focus */}
          <div className="absolute inset-0 bg-black/70 z-0" />
          
          <div className="w-full max-w-[1200px] mx-auto grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6 z-10">
            {/* Left/Main: Vote Panel */}
            <div className="flex flex-col bg-[#d2b48c] border-[6px] border-[#8b5a2b] shadow-[8px_8px_0_0_rgba(0,0,0,0.5)] p-6 relative overflow-hidden" style={{ imageRendering: "pixelated" }}>
               <div className="text-center mb-8 bg-[#8b5a2b] border-[4px] border-[#5c3a21] py-4 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                 <h1 className="pixel-title text-4xl md:text-5xl text-[#ffcf40] drop-shadow-[2px_2px_0_#000]">EMERGENCY MEETING</h1>
                 <p className="mt-2 text-white/90 pixel-small">Called by <span className="text-[#ffcf40]">{snapshot.meeting.startedBy ?? "unknown"}</span></p>
               </div>
               
               {/* Players Grid (Medieval style) */}
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                 {snapshot.players
                   .filter((p) => !p.status?.includes("ejected"))
                   .map((player) => (
                     <motion.button
                       whileHover={{ scale: 1.02, y: -2 }}
                       whileTap={{ scale: 0.98, y: 2 }}
                       key={player.id}
                       onClick={() =>
                         sendRealtimeMessage({
                           type: "meeting.vote",
                           targetPlayerId: player.id,
                         })
                       }
                       className={`relative flex items-center gap-3 p-3 border-[4px] shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] transition-all ${
                         snapshot.meeting.currentVoteTargetId === player.id 
                           ? "border-[#4ade80] bg-[#fff8ea]"
                           : "border-[#5c4427] bg-[#f4e4c1]"
                       }`}
                     >
                       <div className="w-[48px] h-[48px] border-[2px] border-[#5c4427] bg-[#8a6b45] shadow-[inset_0_0_4px_rgba(0,0,0,0.3)] shrink-0 relative flex items-center justify-center">
                          <Image src={getCharacterAsset(player.id)} alt={player.name} width={36} height={36} className="object-contain drop-shadow-md" unoptimized style={{ imageRendering: "pixelated" }} />
                          <div className="absolute top-1 right-1 w-2.5 h-2.5 border-[1px] border-black/50 shadow-sm" style={{ backgroundColor: player.color }} />
                       </div>
                       <div className="flex flex-col items-start text-left flex-1">
                         <span className="pixel-small font-bold text-[#39404f]">
                           {player.name}
                           {player.id === snapshot.currentUser.id && <span className="text-[#8b5a2b] ml-1">(You)</span>}
                         </span>
                         {/* Votes indicator */}
                         <div className="flex items-center gap-1 mt-2">
                           {Array.from({ length: player.meetingVotes ?? 0 }).map((_, i) => (
                             <span key={i} className="w-2.5 h-2.5 bg-[#d9381e] border-[1px] border-[#39404f] shadow-sm" />
                           ))}
                         </div>
                       </div>
                       {/* Megaphone icon for caller */}
                        {snapshot.meeting.startedBy === player.name && (
                         <div className="absolute -top-3 -right-3 text-[#ffcf40] drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)] animate-bounce">
                           <Megaphone className="w-8 h-8 fill-current" />
                         </div>
                       )}
                     </motion.button>
                   ))}
               </div>
               <div className="mt-auto pt-6 text-center text-[#5c4427] pixel-small">
                 Meeting closes automatically after all active players submit a vote.
               </div>
            </div>

            {/* Right side: Chat & Code Snippet */}
            <div className="flex flex-col gap-6">
              {snapshot.meeting.snippet && (
                <div className="bg-[#f4e4c1] border-[4px] border-[#8b5a2b] shadow-[6px_6px_0_0_rgba(0,0,0,0.4)] p-4">
                  <p className="pixel-small text-[#8b5a2b] mb-2 font-bold uppercase border-b-[2px] border-[#8b5a2b] pb-1">
                    Captured Code
                  </p>
                  <pre className="font-mono text-xs text-[#39404f] bg-[#fff8ea] p-3 border-2 border-[#5c4427] max-h-[150px] overflow-y-auto shadow-inner">
                    {snapshot.meeting.snippet}
                  </pre>
                </div>
              )}
              
              <div className="flex-1 bg-[#d2b48c] border-[6px] border-[#8b5a2b] shadow-[6px_6px_0_0_rgba(0,0,0,0.4)] flex flex-col overflow-hidden min-h-[300px]">
                <div className="p-3 border-b-[4px] border-[#8b5a2b] bg-[#8a6b45] flex items-center justify-between shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]">
                  <p className="pixel-small text-white drop-shadow-md">DISCUSSION</p>
                  <span className="px-2 py-1 bg-[#5c4427] text-[#fff8ea] border-[2px] border-[#3e2723] text-[10px] pixel-small">{snapshot.chatMessages.length} msgs</span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto space-y-2 bg-[#f4e4c1] shadow-[inset_0_0_10px_rgba(0,0,0,0.1)]">
                  {snapshot.chatMessages.slice(-20).map((msg, idx) => (
                    <div key={`meeting-chat-${idx}`} className="pixel-small bg-[#fff8ea] px-3 py-2 border-[2px] border-[#e0c9a3] shadow-sm">
                      <span className="font-bold drop-shadow-sm" style={{ color: msg.color }}>{msg.user}: </span>
                      <span className="text-[#39404f]">{msg.message}</span>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t-[4px] border-[#8b5a2b] bg-[#e6c9a8]">
                  <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <input
                      className="flex-1 bg-[#fff8ea] border-[2px] border-[#5c4427] px-3 py-2 pixel-small text-[#39404f] placeholder-[#a69882] focus:outline-none focus:border-[#8b5a2b] shadow-inner"
                      placeholder="Discuss..."
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                    />
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="submit" 
                      className="pixel-button pixel-button-primary px-4 py-2"
                    >
                      SEND
                    </motion.button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
      </AnimatePresence>

      {/* Game Over Overlay */}
      <AnimatePresence>
      {snapshot.phase === "game_over" ? (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 py-10 text-center overflow-y-auto"
          style={{ imageRendering: "pixelated" }}
        >
          <div className="w-full max-w-3xl">
            <motion.p 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className="pixel-title text-4xl sm:text-6xl text-[#ffcf40] drop-shadow-[4px_4px_0_#2b4a1b]"
            >
              GAME OVER
            </motion.p>
            <div className="bg-[#d2b48c] border-[6px] border-[#8b5a2b] shadow-[8px_8px_0_0_rgba(0,0,0,0.5)] mt-6 p-8 relative overflow-hidden">
              <p className="pixel-title text-3xl drop-shadow-md flex items-center justify-center gap-3">
                {snapshot.result.winnerTeam === "civilian" ? <Shield className="w-8 h-8 fill-[#2b4a1b] text-[#2b4a1b]" /> : <Sword className="w-8 h-8 fill-[#7a0f0f] text-[#7a0f0f]" />}{" "}
                <span className={snapshot.result.winnerTeam === "civilian" ? "text-[#2b4a1b]" : "text-[#7a0f0f]"}>
                  {snapshot.result.winnerTeam?.toUpperCase() ?? "UNKNOWN"} WINS
                </span>
              </p>
              <p className="pixel-small mt-4 text-[#5c4427] font-bold">
                {snapshot.result.reason ?? "Session ended."}
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {snapshot.players.map((player) => (
                  <div key={player.id} className="bg-[#f4e4c1] border-[4px] border-[#8b5a2b] shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-[32px] h-[32px] bg-[#8a6b45] border-[2px] border-[#5c4427] shadow-[inset_0_0_4px_rgba(0,0,0,0.3)] flex justify-center items-center relative shrink-0">
                        <Image src={getCharacterAsset(player.id)} alt={player.name} width={24} height={24} className="object-contain drop-shadow-md" unoptimized style={{ imageRendering: "pixelated" }} />
                        <div className="absolute top-0 right-0 w-2 h-2 border-[1px] border-black/50 shadow-sm" style={{ backgroundColor: player.color }} />
                      </div>
                      <span className="pixel-small font-bold text-[#39404f]">{player.name}</span>
                    </div>
                    <span className={`pixel-chip text-[10px] ${player.role === "imposter" ? "pixel-chip-red" : "pixel-chip-green"}`}>
                      {player.role.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>

              {/* AI Post-Game Review */}
              <div className="mt-8">
                <GameReviewPanel sessionId={sessionId} phase={snapshot.phase} />
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => window.location.href = "/"}
                className="pixel-button pixel-button-primary mt-8 text-xl px-10 py-4 shadow-[0_6px_0_0_#9a6a00]"
              >
                BACK TO HOME
              </motion.button>
            </div>
          </div>
        </motion.div>
      ) : null}
      </AnimatePresence>

      {/* Ghost Hint Toast */}
      <AnimatePresence>
        {ghostToast ? (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 50, x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 z-[90] px-5 py-3 bg-[#1a1a2e]/95 backdrop-blur-md border border-[#ff688b]/50 rounded-xl shadow-[0_0_20px_rgba(255,104,139,0.3)] flex items-center gap-3"
          >
            <span className="text-[#ff688b] text-lg">&#128123;</span>
            <p className="pixel-small text-white/90">
              Ghost hint sudah muncul di <span className="text-[#ff688b] font-bold">Chat Panel</span> →
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Role Reveal Overlay */}
      {roleRevealStage !== "hidden" ? (
        <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-colors duration-1000 ${
          roleRevealStage === "assigning"
            ? "bg-black"
            : isCivilian
              ? "bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1d4018] via-[#0c1f09] to-black"
              : "bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#5e0d0d] via-[#240303] to-black"
        }`}>
          {roleRevealStage === "assigning" ? (
            <p className="pixel-title text-3xl sm:text-5xl text-white animate-pulse tracking-widest">
              Assigning roles...
            </p>
          ) : (
            <div className="flex flex-col items-center animate-in zoom-in slide-in-from-bottom-8 duration-700 ease-out">
              <p className={`pixel-title text-7xl sm:text-9xl tracking-widest drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] ${
                isCivilian ? "text-[#a2e858]" : "text-[#ff3333]"
              }`}>
                {roleLabel}
              </p>
              <p className={`pixel-small mt-6 text-xl sm:text-2xl tracking-wide drop-shadow-md ${
                isCivilian ? "text-[#c5ff8f]" : "text-[#ff8f8f]"
              }`}>
                {isCivilian ? "Complete tasks & find the imposter" : "Sabotage and eliminate them all"}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
