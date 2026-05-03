"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useRef, useState } from "react";
import { getSession, getSessionWebSocketUrl } from "@/lib/api";
import { getSessionPlayerId } from "@/lib/player-session";
import type { GameSnapshot } from "@/types";
import { getCharacterAsset } from "@/lib/character-assets";

const CodeEditor = dynamic(
  () => import("@/components/editor/CodeEditor").then((m) => m.CodeEditor),
  { ssr: false, loading: () => <div className="min-h-[590px] bg-[#1f2033] animate-pulse" /> },
);

type GameSessionClientProps = {
  sessionId: string;
};

type OutgoingMessage =
  | { type: "chat.send"; message: string }
  | { type: "editor.update"; content: string }
  | { type: "category.vote"; categorySlug: string }
  | { type: "meeting.start" }
  | { type: "meeting.vote"; targetPlayerId: string }
  | { type: "sabotage.use" };

export function GameSessionClient({ sessionId }: GameSessionClientProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const editorSyncTimerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [roleRevealStage, setRoleRevealStage] = useState<"hidden" | "assigning" | "revealed">("hidden");
  const hasShownRoleRef = useRef(false);

  useEffect(() => {
    const playerId = getSessionPlayerId(sessionId);
    let cancelled = false;
    let websocket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    async function loadSession() {
      try {
        const nextSnapshot = await getSession(sessionId, playerId ?? undefined);
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setEditorContent(nextSnapshot.editorContent);
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

    function connect() {
      websocket = new window.WebSocket(
        getSessionWebSocketUrl(sessionId, playerId ?? undefined),
      );
      socketRef.current = websocket;

      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data) as {
          type: "session.updated";
          payload: GameSnapshot | null;
        };

        if (!cancelled && message.type === "session.updated" && message.payload) {
          setSnapshot(message.payload);
          setEditorContent(message.payload.editorContent);
          setLoadError(null);
        }
      };

      websocket.onerror = () => {
        void loadSession();
      };

      websocket.onclose = () => {
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    }

    void loadSession();
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (editorSyncTimerRef.current !== null) {
        window.clearTimeout(editorSyncTimerRef.current);
      }
      socketRef.current = null;
      websocket?.close();
    };
  }, [sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [snapshot?.chatMessages.length]);

  useEffect(() => {
    if (snapshot?.phase === "playing" && !hasShownRoleRef.current) {
      hasShownRoleRef.current = true;
      setRoleRevealStage("assigning");
      const t1 = setTimeout(() => {
        setRoleRevealStage("revealed");
      }, 2500);
      const t2 = setTimeout(() => {
        setRoleRevealStage("hidden");
      }, 5500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [snapshot?.phase]);

  function sendRealtimeMessage(payload: OutgoingMessage) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(payload));
  }

  function handleEditorChange(nextValue: string) {
    setEditorContent(nextValue);

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
  const primaryActionLabel = isCivilian ? "△ EMERGENCY" : "⚠ SABOTAGE";
  const sideTitle = isCivilian ? "Test Cases" : "Sabotage Tasks";
  const sideCount = isCivilian ? `(${snapshot.objectives.filter(o => o.done).length}/${snapshot.objectives.length})` : `(${snapshot.sabotageCharges}/5)`;
  const sidebarItems = isCivilian ? snapshot.objectives : snapshot.imposterObjectives;
  const editorHeaderTone = isCivilian ? "pixel-chip-orange" : "pixel-chip-red";
  const rightPanelTitle = isCivilian ? "Chat" : "Covert Feed + Chat";
  const rightMessages = isCivilian
    ? snapshot.chatMessages
    : [...snapshot.imposterFeed, ...snapshot.chatMessages];
  const actionDisabled = snapshot.phase !== "playing";
  const editorLang = snapshot.challenge.language || "javascript";

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
      <main className="min-h-screen bg-[#0b1418] px-3 py-4 text-[color:var(--foreground)] sm:px-6">
        <section className="mx-auto max-w-[1500px]">
          {/* Header bar */}
          <div className="pixel-panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
            <div className="pixel-panel px-3 py-2 text-2xl">{snapshot.timeRemaining}</div>
          </div>

          {/* Main 3-column layout */}
          <section className="grid min-h-[760px] grid-cols-1 gap-0 border-4 border-[color:var(--brown)] bg-[color:var(--cream)] xl:grid-cols-[220px_1fr_240px]">
            {/* Left sidebar: players + objectives */}
            <aside className="border-b-4 border-[color:var(--brown)] p-4 xl:border-r-4 xl:border-b-0">
              <h2 className="text-2xl">Players</h2>
              <div className="mt-4 space-y-2">
                {snapshot.players.map((player) => (
                  <div key={player.id} className="flex items-center gap-3">
                    <div className="w-[36px] h-[36px] flex items-center justify-center border-[2px] border-[#5c4427] bg-[#8a6b45] shadow-[inset_0_0_4px_rgba(0,0,0,0.3)] shrink-0 relative">
                      <img 
                        src={getCharacterAsset(player.id)} 
                        alt={player.name}
                        style={{ imageRendering: "pixelated" }}
                        className="w-[24px] h-[24px] object-contain drop-shadow-md"
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

              <div className="mt-6">
                <h3 className="text-xl">{sideTitle}</h3>
                <p className="mt-1 text-base text-white/80">{sideCount}</p>
                <div className="mt-3 space-y-2">
                  {sidebarItems.map((objective) => (
                    <div
                      key={objective.title}
                      className={`pixel-panel px-3 py-2 ${objective.done ? "bg-[#9ed46c]/30" : "bg-[#fff9ee]"}`}
                    >
                      <p className="pixel-small">{objective.title}</p>
                    </div>
                  ))}
                </div>
                <p className="pixel-small mt-4 text-[color:var(--text-muted)]">
                  {isCivilian
                    ? "Call emergency meeting if you see something sus."
                    : `${snapshot.sabotageCharges} charges left. Use wisely.`}
                </p>
              </div>
            </aside>

            {/* Center: Code Editor */}
            <div className="border-b-4 border-[color:var(--brown)] xl:border-r-4 xl:border-b-0 flex flex-col">
              {/* Challenge header */}
              <div className="border-b-4 border-[color:var(--brown)] bg-[#1a1b2e] px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="pixel-small text-[#a2e858]">{snapshot.challenge.title}</span>
                  <span className="pixel-chip text-[10px]">{editorLang}</span>
                </div>
                <span className="pixel-chip pixel-chip-orange text-[10px]">{snapshot.challenge.difficulty}</span>
              </div>

              {/* CodeMirror Editor */}
              <div className="flex-1 min-h-[520px] bg-[#1f2033]">
                <CodeEditor
                  value={editorContent}
                  language={editorLang}
                  disabled={snapshot.phase !== "playing"}
                  onChange={handleEditorChange}
                />
              </div>

              {/* Action bar */}
              <div className="flex items-center justify-between border-t-4 border-[color:var(--brown)] bg-[#f7edd8] p-3">
                <div className="pixel-small text-[#5c4427]">
                  {snapshot.challenge.description}
                </div>
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={actionDisabled || (!isCivilian && snapshot.sabotageCharges <= 0)}
                  className={`pixel-button shrink-0 ml-3 ${isCivilian ? "pixel-button-danger" : "bg-[#a43b57] text-[#fff0ef] border-4 border-[color:var(--brown-dark)] shadow-[inset_0_0_0_4px_#d66b85,0_4px_0_0_rgba(0,0,0,0.2)]"} ${actionDisabled ? "opacity-60" : ""}`}
                >
                  {primaryActionLabel}
                </button>
              </div>
            </div>

            {/* Right sidebar: Chat */}
            <aside className="grid min-h-full grid-rows-[1fr_auto]">
              <div className="flex flex-col">
                <div className="border-b-4 border-[color:var(--brown)] px-2 py-3 text-center text-base xl:text-lg shrink-0 leading-tight">
                  {rightPanelTitle}
                </div>
                <div className="p-3 flex-1 overflow-y-auto max-h-[620px]">
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

              <div className="border-t-4 border-[color:var(--brown)] p-3">
                <form onSubmit={handleChatSubmit} className="grid grid-cols-[1fr_42px] gap-2">
                  <input
                    className="pixel-input min-h-[40px] text-xs px-2"
                    placeholder={isCivilian ? "Type a message..." : "Covert message..."}
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                  />
                  <button type="submit" className="pixel-button pixel-button-primary px-0">
                    ➜
                  </button>
                </form>
              </div>
            </aside>
          </section>
        </section>
      </main>

      {/* Category Vote Overlay */}
      {snapshot.phase === "category" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-4 text-center">
          <div className="max-w-3xl">
            <p className="pixel-title text-4xl sm:text-6xl">VOTE CATEGORY</p>
            <p className="pixel-small mt-3 text-white/70">Round {snapshot.round} of {snapshot.maxRounds}</p>
            <div className="pixel-panel mt-8 w-full min-w-[300px] max-w-[520px] p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className="text-left text-xl">Choose challenge type</p>
                <div className="pixel-panel px-3 py-2 text-xl">
                  {snapshot.currentCategoryVote ? "VOTED" : "OPEN"}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {snapshot.categoryVoteOptions.map((category) => (
                  <button
                    key={category.slug}
                    type="button"
                    onClick={() =>
                      sendRealtimeMessage({
                        type: "category.vote",
                        categorySlug: category.slug,
                      })
                    }
                    className={`pixel-panel flex flex-col px-4 py-3 text-left ${
                      snapshot.currentCategoryVote === category.slug ? "bg-[#9bc8dd]" : "bg-[#fff8ea]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="pixel-small pr-3 font-bold">{category.name}</span>
                      <span className="pixel-chip pixel-chip-green">{category.votes}</span>
                    </div>
                    <span className="pixel-small mt-1 text-[color:var(--text-muted)] text-[10px]">
                      {category.description}
                    </span>
                  </button>
                ))}
              </div>
              <p className="pixel-small mt-5 text-[color:var(--text-muted)]">
                Semua pemain vote dulu. Server akan lock kategori dengan suara tertinggi.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Emergency Meeting Overlay */}
      {snapshot.phase === "meeting" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 py-10 text-center overflow-y-auto">
          <div className="w-full max-w-4xl">
            <p className="pixel-title text-4xl sm:text-6xl">EMERGENCY MEETING</p>
            <p className="pixel-small mt-4 text-[#d9ddde]">
              Called by {snapshot.meeting.startedBy ?? "unknown"}
            </p>

            {/* Code snippet review */}
            {snapshot.meeting.snippet ? (
              <div className="pixel-panel mt-6 p-4 text-left">
                <p className="pixel-small mb-3 text-[color:var(--text-muted)]">📋 Captured code snapshot at meeting time</p>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm text-[#39404f] bg-[#fff8ea] p-3 border-2 border-[color:var(--brown-dark)] max-h-[200px] overflow-y-auto">
                  {snapshot.meeting.snippet}
                </pre>
              </div>
            ) : null}

            {/* Vote panel */}
            <div className="pixel-panel mt-6 p-5">
              <p className="text-xl">Vote who to eject</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {snapshot.players
                  .filter((p) => !p.status?.includes("ejected"))
                  .map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() =>
                        sendRealtimeMessage({
                          type: "meeting.vote",
                          targetPlayerId: player.id,
                        })
                      }
                      className={`pixel-panel flex items-center justify-between px-4 py-3 text-left ${
                        snapshot.meeting.currentVoteTargetId === player.id ? "bg-[#ffd6a5]" : "bg-[#fff8ea]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 border border-[color:var(--brown-dark)]"
                          style={{ backgroundColor: player.color }}
                        />
                        <span className="pixel-small pr-3">
                          {player.name}
                          {player.id === snapshot.currentUser.id ? " (You)" : ""}
                        </span>
                      </div>
                      <span className="pixel-chip">{player.meetingVotes ?? 0}</span>
                    </button>
                  ))}
              </div>
              <p className="pixel-small mt-5 text-[color:var(--text-muted)]">
                Meeting closes automatically after all active players submit a vote.
              </p>
            </div>

            {/* Chat during meeting */}
            <div className="pixel-panel mt-4 p-4 text-left">
              <p className="pixel-small mb-2 text-white/80">💬 Discussion</p>
              <div className="max-h-[150px] overflow-y-auto space-y-2 mb-3">
                {snapshot.chatMessages.slice(-10).map((msg, idx) => (
                  <div key={`meeting-chat-${idx}`} className="pixel-small">
                    <span className="font-semibold" style={{ color: msg.color }}>{msg.user}: </span>
                    <span className="text-[color:var(--text-muted)]">{msg.message}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleChatSubmit} className="grid grid-cols-[1fr_42px] gap-2">
                <input
                  className="pixel-input min-h-[36px] text-sm"
                  placeholder="Discuss during meeting..."
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                />
                <button type="submit" className="pixel-button pixel-button-primary px-0 min-h-[36px]">
                  ➜
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* Game Over Overlay */}
      {snapshot.phase === "game_over" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 py-10 text-center">
          <div className="w-full max-w-3xl">
            <p className="pixel-title text-4xl sm:text-6xl">GAME OVER</p>
            <div className="pixel-panel mt-6 p-6">
              <p className="text-3xl">
                {snapshot.result.winnerTeam === "civilian" ? "🛡️" : "🔪"}{" "}
                {snapshot.result.winnerTeam?.toUpperCase() ?? "UNKNOWN"} WINS
              </p>
              <p className="pixel-small mt-4 text-[color:var(--text-muted)]">
                {snapshot.result.reason ?? "Session ended."}
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {snapshot.players.map((player) => (
                  <div key={player.id} className="pixel-panel bg-[#fff8ea] px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3" style={{ backgroundColor: player.color }} />
                      <span className="pixel-small">{player.name}</span>
                    </div>
                    <span className={`pixel-chip text-[10px] ${player.role === "imposter" ? "pixel-chip-red" : "pixel-chip-green"}`}>
                      {player.role.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => window.location.href = "/"}
                className="pixel-button pixel-button-primary mt-6 text-lg px-8"
              >
                BACK TO HOME
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
