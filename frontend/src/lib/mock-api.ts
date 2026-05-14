import type {
  CategoryOption,
  ChallengeTest,
  ChatMessage,
  GameObjective,
  GameSnapshot,
  LeaderboardSnapshot,
  LobbyPlayer,
  LobbySnapshot,
  Player,
  SandboxRunResponse,
  SecurityScanReport,
} from "@/types";

const STORE_KEY = "code-mafia:mock-store:v1";
const CATEGORY_VOTE_DURATION_SECONDS = 10;
const ROUND_DURATION_SECONDS = 120;
const COLOR_PALETTE = ["#14f59b", "#ffd95a", "#6da8ff", "#ff688b", "#ff9f43"];
const PLAYER_TITLES = [
  "Host / Frontend Fixer",
  "Debugger",
  "Bug Hunter",
  "Quiet Contributor",
  "Night Reviewer",
];

type SessionRealtimeMessage =
  | { type: "chat.send"; message: string }
  | { type: "editor.update"; content: string }
  | { type: "editor.cursor"; anchor: number; head: number }
  | { type: "category.vote"; categorySlug: string }
  | { type: "meeting.start" }
  | { type: "meeting.vote"; targetPlayerId: string };

type MockImposterTask = GameObjective & {
  lineHint: number;
  expectedPattern: string;
  forbiddenPattern?: string;
  hint: string;
};

type MockChallenge = {
  title: string;
  description: string;
  language: string;
  difficulty: string;
  tests: ChallengeTest[];
  objectives: GameObjective[];
  imposterObjectives: MockImposterTask[];
  editorContent: string;
};

type MockLobbyRecord = {
  code: string;
  host: string;
  status: string;
  maxPlayers: number;
  players: LobbyPlayer[];
  activeSessionId: string | null;
};

type MockSessionRecord = {
  id: string;
  lobbyCode: string;
  round: number;
  maxRounds: number;
  categorySlug: string;
  phase: GameSnapshot["phase"];
  timeRemainingSeconds: number;
  sabotageCharges: number;
  players: Player[];
  challenge: MockChallenge;
  categoryVotes: Record<string, string>;
  chatMessages: ChatMessage[];
  imposterFeed: ChatMessage[];
  editorContent: string;
  meetingStartedBy: string | null;
  meetingSnippet: string;
  meetingVotes: Record<string, string>;
  result: GameSnapshot["result"];
  imposterTaskProgress: number[];
  lastTestResults: Array<{ passed: boolean; input: string; expected: string; actual: string; error?: string }>;
};

type MockStore = {
  nextId: number;
  leaderboard: LeaderboardSnapshot;
  lobbies: Record<string, MockLobbyRecord>;
  sessions: Record<string, MockSessionRecord>;
};

type SnapshotListener<T> = (snapshot: T) => void;

const CATEGORIES: CategoryOption[] = [
  {
    slug: "dsa",
    name: "DSA",
    description: "Array, graph, recursion, greedy, dan test-case heavy debugging.",
    votes: 0,
    roundEstimate: "4 rounds",
  },
  {
    slug: "oop",
    name: "OOP",
    description: "Refactor class design, inheritance bugs, dan interface contracts.",
    votes: 0,
    roundEstimate: "3 rounds",
  },
  {
    slug: "web-dev",
    name: "Web Development",
    description: "HTML, CSS, JavaScript, DOM logic, dan browser-state edge cases.",
    votes: 0,
    roundEstimate: "4 rounds",
  },
  {
    slug: "algorithms-lite",
    name: "Speedrun Logic",
    description: "Challenge pendek untuk lobby yang mau pace cepat dan agresif.",
    votes: 0,
    roundEstimate: "2 rounds",
  },
];

const LEADERBOARD: LeaderboardSnapshot = {
  leaderboardEntries: [
    { username: "rayyan.exe", category: "DSA", score: 1540, record: "9W-1L" },
    { username: "salsa.null", category: "Web Development", score: 1480, record: "8W-2L" },
    { username: "nabila.dev", category: "OOP", score: 1420, record: "7W-3L" },
    { username: "bimo.loop", category: "Speedrun Logic", score: 1375, record: "7W-3L" },
  ],
  hallOfFame: [
    {
      title: "Fastest Patch",
      player: "rayyan.exe",
      description: "Solved three sabotage mutations in under 40 seconds.",
      tone: "accent",
    },
    {
      title: "Quiet Carry",
      player: "salsa.null",
      description: "Closed the final round without triggering emergency meeting.",
      tone: "success",
    },
    {
      title: "Most Sus",
      player: "ghost.null",
      description: "Talked a lot, pushed one bad hint, still escaped the vote.",
      tone: "warning",
    },
  ],
};

const CHALLENGES: Record<string, MockChallenge> = {
  oop: {
    title: "Repair Counter class behavior",
    description: "Perbaiki decrement, reset, dan value tanpa mengubah public API class.",
    language: "python",
    difficulty: "medium",
    tests: [
      { input: "Counter().decrement()", expected: "count berkurang 1" },
      { input: "counter.reset()", expected: "count kembali ke 0" },
      { input: "counter.value()", expected: "mengembalikan count saat ini" },
    ],
    objectives: [
      { title: "Pass 3 hidden test cases", description: "Pastikan decrement, reset, dan value valid.", done: false },
      { title: "Check state mutation", description: "Bandingkan output counter sebelum submit.", done: false },
      { title: "Submit clean patch", description: "Jangan ubah public API class.", done: false },
    ],
    imposterObjectives: [
      {
        title: "Reverse increment direction",
        description: "Ubah `self.count += 1` jadi `self.count -= 1` di method `increment`.",
        done: false,
        lineHint: 7,
        expectedPattern: "self\\.count\\s*-=\\s*1",
        forbiddenPattern: "self\\.count\\s*\\+=\\s*1",
        hint: "Cari `self.count += 1` di line 7, ganti `+=` jadi `-=`.",
      },
      {
        title: "Komentari history append",
        description: "Komentari baris `self.history.append(\"inc\")` di method `increment`.",
        done: false,
        lineHint: 8,
        expectedPattern: "#\\s*self\\.history\\.append\\(\"inc\"\\)",
        hint: "Tambahkan `# ` di depan `self.history.append(\"inc\")` di line 8.",
      },
      {
        title: "Decrement extreme",
        description: "Ubah `self.count -= 2` jadi `self.count -= 5` di `decrement`.",
        done: false,
        lineHint: 11,
        expectedPattern: "self\\.count\\s*-=\\s*5",
        forbiddenPattern: "self\\.count\\s*-=\\s*2",
        hint: "Ubah angka `2` jadi `5` di line 11.",
      },
      {
        title: "Reset jadi nilai aneh",
        description: "Ubah `pass` di `reset` jadi `self.count = 999`.",
        done: false,
        lineHint: 15,
        expectedPattern: "self\\.count\\s*=\\s*999",
        forbiddenPattern: "def\\s+reset\\(self\\):\\s*\\n\\s*pass",
        hint: "Ganti `pass` di line 15 jadi `self.count = 999`.",
      },
      {
        title: "Geser hasil value",
        description: "Ubah `len(self.history)` jadi `len(self.history) + 1`.",
        done: false,
        lineHint: 18,
        expectedPattern: "len\\(self\\.history\\)\\s*\\+\\s*1",
        hint: "Tambahkan `+ 1` di akhir return line 18.",
      },
    ],
    editorContent: [
      "class Counter:",
      "    def __init__(self):",
      "        self.count = 0",
      "        self.history = []",
      "",
      "    def increment(self):",
      "        self.count += 1",
      "        self.history.append(\"inc\")",
      "",
      "    def decrement(self):",
      "        self.count -= 2",
      "        self.history.append(\"dec\")",
      "",
      "    def reset(self):",
      "        pass",
      "",
      "    def value(self):",
      "        return len(self.history)",
    ].join("\n"),
  },
  "web-dev": {
    title: "Fix filterProducts render logic",
    description: "Temukan bug filter dan perbaiki empty-state di browser flow.",
    language: "javascript",
    difficulty: "medium",
    tests: [
      { input: "filterProducts([\"hat\"], \"ha\")", expected: "[\"hat\"]" },
      { input: "filterProducts([\"hat\"], \"\")", expected: "[\"hat\"]" },
      { input: "renderEmpty([])", expected: "\"No products found\"" },
    ],
    objectives: [
      { title: "Fix case-insensitive match", description: "Query harus cocok untuk uppercase dan lowercase.", done: false },
      { title: "Preserve original items", description: "Jangan mutate array input.", done: false },
      { title: "Show proper empty state", description: "UI harus kasih fallback yang benar.", done: false },
    ],
    imposterObjectives: [
      {
        title: "Inversi guard kosong",
        description: "Ubah `if (!query)` jadi `if (query)`.",
        done: false,
        lineHint: 2,
        expectedPattern: "if\\s*\\(\\s*query\\s*\\)",
        forbiddenPattern: "if\\s*\\(\\s*!\\s*query\\s*\\)",
        hint: "Hapus `!` di line 2.",
      },
      {
        title: "Return array kosong dipanggil dulu",
        description: "Ubah `return [];` jadi `return items;` di guard.",
        done: false,
        lineHint: 3,
        expectedPattern: "return\\s+items\\s*;",
        forbiddenPattern: "return\\s+\\[\\s*\\]\\s*;",
        hint: "Ubah `return [];` jadi `return items;` di line 3.",
      },
      {
        title: "Filter selalu false",
        description: "Ubah `item.includes(query)` jadi `false`.",
        done: false,
        lineHint: 6,
        expectedPattern: "items\\.filter\\(\\(item\\)\\s*=>\\s*false\\)",
        hint: "Ubah body filter di line 6 jadi `=> false`.",
      },
      {
        title: "Inversi cek empty render",
        description: "Ubah `items.length > 0` jadi `items.length === 0`.",
        done: false,
        lineHint: 10,
        expectedPattern: "items\\.length\\s*===\\s*0",
        forbiddenPattern: "items\\.length\\s*>\\s*0",
        hint: "Ubah `> 0` jadi `=== 0` di line 10.",
      },
      {
        title: "Tukar empty message",
        description: "Tukar `'Showing results'` jadi `'Empty cart'`.",
        done: false,
        lineHint: 13,
        expectedPattern: "['\"]Empty cart['\"]",
        forbiddenPattern: "['\"]Showing results['\"]",
        hint: "Ubah string `'Showing results'` jadi `'Empty cart'` di line 13.",
      },
    ],
    editorContent: [
      "export function filterProducts(items, query) {",
      "  if (!query) {",
      "    return [];",
      "  }",
      "",
      "  return items.filter((item) => item.includes(query));",
      "}",
      "",
      "export function renderEmpty(items) {",
      "  if (items.length > 0) {",
      "    return \"No products found\";",
      "  }",
      "",
      "  return \"Showing results\";",
      "}",
    ].join("\n"),
  },
  dsa: {
    title: "Patch sliding window sum",
    description: "Perbaiki update pointer agar hasil max sum tidak off-by-one.",
    language: "python",
    difficulty: "hard",
    tests: [
      { input: "max_sum([1,2,3,4], 2)", expected: "7" },
      { input: "max_sum([5,1,3], 1)", expected: "5" },
      { input: "max_sum([2,2,2], 3)", expected: "6" },
    ],
    objectives: [
      { title: "Fix window movement", description: "Pastikan left/right bergerak benar.", done: false },
      { title: "Handle full-length window", description: "k == len(nums) harus valid.", done: false },
      { title: "Avoid double-counting", description: "Sum tidak boleh bertambah salah.", done: false },
    ],
    imposterObjectives: [
      {
        title: "Reverse guard sign",
        description: "Ubah `k <= 0` jadi `k > 0` di guard.",
        done: false,
        lineHint: 2,
        expectedPattern: "if\\s+k\\s*>\\s*0",
        forbiddenPattern: "if\\s+k\\s*<=\\s*0",
        hint: "Ubah `k <= 0` jadi `k > 0` di line 2.",
      },
      {
        title: "Window awal jadi 0",
        description: "Ubah `sum(nums[:k])` jadi `0`.",
        done: false,
        lineHint: 5,
        expectedPattern: "window\\s*=\\s*0\\b",
        forbiddenPattern: "window\\s*=\\s*sum\\(nums\\[:k\\]\\)",
        hint: "Ubah `sum(nums[:k])` jadi `0` di line 5.",
      },
      {
        title: "Best mulai dari -1",
        description: "Ubah `best = window` jadi `best = -1`.",
        done: false,
        lineHint: 6,
        expectedPattern: "best\\s*=\\s*-1",
        forbiddenPattern: "best\\s*=\\s*window\\s*$",
        hint: "Ubah `best = window` jadi `best = -1` di line 6.",
      },
      {
        title: "Hapus update window add",
        description: "Komentari `window += nums[right]`.",
        done: false,
        lineHint: 10,
        expectedPattern: "#\\s*window\\s*\\+=\\s*nums\\[right\\]",
        hint: "Tambahkan `# ` di depan `window += nums[right]` di line 10.",
      },
      {
        title: "Pakai min, bukan max",
        description: "Ubah `max(best, window)` jadi `min(best, window)`.",
        done: false,
        lineHint: 13,
        expectedPattern: "min\\(best,\\s*window\\)",
        forbiddenPattern: "max\\(best,\\s*window\\)",
        hint: "Ubah `max` jadi `min` di line 13.",
      },
    ],
    editorContent: [
      "def max_sum(nums, k):",
      "    if k <= 0 or k > len(nums):",
      "        return 0",
      "",
      "    window = sum(nums[:k])",
      "    best = window",
      "    left = 0",
      "",
      "    for right in range(k, len(nums) - 1):",
      "        window += nums[right]",
      "        window -= nums[left]",
      "        left += 1",
      "        best = max(best, window)",
      "",
      "    return best",
    ].join("\n"),
  },
  "algorithms-lite": {
    title: "Repair mergeIntervals output",
    description: "Satukan interval overlap dan jaga urutan hasil akhirnya.",
    language: "javascript",
    difficulty: "easy",
    tests: [
      { input: "mergeIntervals([[1,3],[2,5]])", expected: "[[1,5]]" },
      { input: "mergeIntervals([[1,2],[4,5]])", expected: "[[1,2],[4,5]]" },
      { input: "mergeIntervals([])", expected: "[]" },
    ],
    objectives: [
      { title: "Sort by start", description: "Interval harus diproses berurutan.", done: false },
      { title: "Merge overlap correctly", description: "Gunakan end terbesar saat overlap.", done: false },
      { title: "Return stable output", description: "Hasil final tetap rapih untuk renderer.", done: false },
    ],
    imposterObjectives: [
      {
        title: "Inversi guard kosong",
        description: "Ubah `if (!intervals.length)` jadi `if (intervals.length)`.",
        done: false,
        lineHint: 2,
        expectedPattern: "if\\s*\\(\\s*intervals\\.length\\s*\\)",
        forbiddenPattern: "if\\s*\\(\\s*!\\s*intervals\\.length\\s*\\)",
        hint: "Hapus `!` di line 2.",
      },
      {
        title: "Sort by end (bukan start)",
        description: "Tetap pakai `a[1] - b[1]` (sudah salah). Ubah jadi `b[0] - a[0]` (descending start).",
        done: false,
        lineHint: 6,
        expectedPattern: "b\\[0\\]\\s*-\\s*a\\[0\\]",
        forbiddenPattern: "a\\[1\\]\\s*-\\s*b\\[1\\]",
        hint: "Ubah `a[1] - b[1]` jadi `b[0] - a[0]` di line 6.",
      },
      {
        title: "Mulai merged kosong",
        description: "Ubah `[sorted[0]]` jadi `[]`.",
        done: false,
        lineHint: 7,
        expectedPattern: "const\\s+merged\\s*=\\s*\\[\\s*\\]",
        forbiddenPattern: "const\\s+merged\\s*=\\s*\\[sorted\\[0\\]\\]",
        hint: "Ubah `[sorted[0]]` jadi `[]` di line 7.",
      },
      {
        title: "Off-by-one loop start",
        description: "Ubah `let i = 1` jadi `let i = 0`.",
        done: false,
        lineHint: 9,
        expectedPattern: "let\\s+i\\s*=\\s*0\\s*;",
        forbiddenPattern: "let\\s+i\\s*=\\s*1\\s*;",
        hint: "Ubah `i = 1` jadi `i = 0` di line 9.",
      },
      {
        title: "Continue jadi break",
        description: "Ubah `continue;` di branch overlap jadi `break;`.",
        done: false,
        lineHint: 15,
        expectedPattern: "last\\[1\\]\\s*=\\s*current\\[1\\]\\s*;\\s*\\n\\s*break\\s*;",
        forbiddenPattern: "last\\[1\\]\\s*=\\s*current\\[1\\]\\s*;\\s*\\n\\s*continue\\s*;",
        hint: "Ubah `continue;` jadi `break;` di line 15 (setelah merge assignment).",
      },
    ],
    editorContent: [
      "export function mergeIntervals(intervals) {",
      "  if (!intervals.length) {",
      "    return [];",
      "  }",
      "",
      "  const sorted = [...intervals].sort((a, b) => a[1] - b[1]);",
      "  const merged = [sorted[0]];",
      "",
      "  for (let i = 1; i < sorted.length; i += 1) {",
      "    const current = sorted[i];",
      "    const last = merged[merged.length - 1];",
      "",
      "    if (current[0] <= last[1]) {",
      "      last[1] = current[1];",
      "      continue;",
      "    }",
      "",
      "    merged.push(current);",
      "  }",
      "",
      "  return merged;",
      "}",
    ].join("\n"),
  },
};

const lobbyListeners = new Map<string, Set<SnapshotListener<LobbySnapshot>>>();
const sessionListeners = new Map<string, Set<SnapshotListener<GameSnapshot>>>();
const sessionTimers = new Map<string, ReturnType<typeof setInterval>>();

function parseTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDefaultStore(): MockStore {
  const seedLobbyCode = "MOCK01";
  const seedLobby: MockLobbyRecord = {
    code: seedLobbyCode,
    host: "Rayyan",
    status: "waiting",
    maxPlayers: 4,
    activeSessionId: null,
    players: [
      {
        id: "player-1",
        name: "Rayyan",
        title: PLAYER_TITLES[0],
        color: COLOR_PALETTE[0],
        isReady: true,
        isHost: true,
      },
      {
        id: "player-2",
        name: "Nabila",
        title: PLAYER_TITLES[1],
        color: COLOR_PALETTE[1],
        isReady: true,
        isHost: false,
      },
      {
        id: "player-3",
        name: "Bimo",
        title: PLAYER_TITLES[2],
        color: COLOR_PALETTE[2],
        isReady: true,
        isHost: false,
      },
    ],
  };

  return {
    nextId: 10,
    leaderboard: clone(LEADERBOARD),
    lobbies: {
      [seedLobbyCode]: seedLobby,
    },
    sessions: {},
  };
}

function readStore(): MockStore {
  if (typeof window === "undefined") {
    return buildDefaultStore();
  }

  const raw = window.localStorage.getItem(STORE_KEY);
  if (!raw) {
    const fallback = buildDefaultStore();
    writeStore(fallback);
    return fallback;
  }

  try {
    return JSON.parse(raw) as MockStore;
  } catch {
    const fallback = buildDefaultStore();
    writeStore(fallback);
    return fallback;
  }
}

function writeStore(store: MockStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function withStore<T>(updater: (store: MockStore) => T): T {
  const store = readStore();
  const result = updater(store);
  writeStore(store);
  return result;
}

function nextId(store: MockStore, prefix: string) {
  const id = `${prefix}-${store.nextId}`;
  store.nextId += 1;
  return id;
}

function ensureLobby(code: string) {
  const snapshot = withStore((store) => store.lobbies[code.toUpperCase()] ?? null);
  if (!snapshot) {
    throw new Error("Lobby tidak ditemukan.");
  }
  return snapshot;
}

function ensureSession(sessionId: string) {
  const snapshot = withStore((store) => store.sessions[sessionId] ?? null);
  if (!snapshot) {
    throw new Error("Session tidak ditemukan.");
  }
  return snapshot;
}

function buildLobbySnapshot(lobby: MockLobbyRecord): LobbySnapshot {
  return {
    host: lobby.host,
    status: lobby.status,
    maxPlayers: lobby.maxPlayers,
    players: clone(lobby.players),
    categories: clone(CATEGORIES),
    activeSessionId: lobby.activeSessionId,
  };
}

function buildSessionSnapshot(session: MockSessionRecord, playerId?: string): GameSnapshot {
  const currentPlayer = session.players.find((player) => player.id === playerId) ?? session.players[0];
  const isCivilian = currentPlayer?.role !== "imposter";
  const categoryVoteCount = Object.values(session.categoryVotes).reduce<Record<string, number>>(
    (counts, slug) => {
      counts[slug] = (counts[slug] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const meetingVoteCount = Object.values(session.meetingVotes).reduce<Record<string, number>>(
    (counts, targetId) => {
      counts[targetId] = (counts[targetId] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return {
    phase: session.phase,
    round: session.round,
    maxRounds: session.maxRounds,
    category: CATEGORIES.find((category) => category.slug === session.categorySlug)?.name ?? "Unknown",
    timeRemaining: `${session.timeRemainingSeconds}s`,
    sabotageCharges: session.sabotageCharges,
    currentUser: {
      id: currentPlayer?.id ?? "",
      role: currentPlayer?.role ?? "civilian",
      roleDescription: isCivilian
        ? "Fix the bugs, clear the tests, and identify the impostor before round 4 ends."
        : "Blend in, inject subtle bugs, poison hints, and keep your sabotage hidden.",
    },
    challenge: {
      title: session.challenge.title,
      description: session.challenge.description,
      language: session.challenge.language,
      difficulty: session.challenge.difficulty,
      tests: clone(session.challenge.tests),
    },
    categoryVoteOptions: CATEGORIES.map((category) => ({
      ...category,
      votes: categoryVoteCount[category.slug] ?? 0,
    })),
    players: session.players.map((player) => ({
      ...player,
      meetingVotes: meetingVoteCount[player.id] ?? 0,
    })),
    objectives: session.challenge.objectives.map((objective, index) => ({
      ...objective,
      done: session.lastTestResults?.[index]?.passed === true,
    })),
    imposterObjectives: session.challenge.imposterObjectives.map((objective, index) => ({
      title: objective.title,
      description: objective.description,
      lineHint: objective.lineHint,
      done: session.imposterTaskProgress.includes(index),
    })),
    chatMessages: clone(session.chatMessages),
    imposterFeed: clone(session.imposterFeed),
    editorContent: session.editorContent,
    editorLines: session.editorContent.split("\n").map((content, index) => ({
      number: index + 1,
      content,
    })),
    currentCategoryVote: currentPlayer ? session.categoryVotes[currentPlayer.id] ?? null : null,
    meeting: {
      startedBy: session.meetingStartedBy,
      snippet: session.meetingSnippet,
      currentVoteTargetId: currentPlayer ? session.meetingVotes[currentPlayer.id] ?? null : null,
    },
    result: clone(session.result),
  };
}

function notifyLobby(code: string) {
  const listeners = lobbyListeners.get(code.toUpperCase());
  if (!listeners?.size) {
    return;
  }

  const lobby = ensureLobby(code);
  const snapshot = buildLobbySnapshot(lobby);
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function notifySession(sessionId: string) {
  const listeners = sessionListeners.get(sessionId);
  if (!listeners?.size) {
    return;
  }

  const session = ensureSession(sessionId);
  for (const listener of listeners) {
    listener(buildSessionSnapshot(session));
  }
}

function startSessionTimer(sessionId: string) {
  if (sessionTimers.has(sessionId)) {
    return;
  }

  sessionTimers.set(
    sessionId,
    setInterval(() => {
      withStore((store) => {
        const session = store.sessions[sessionId];
        if (!session || session.phase === "meeting" || session.phase === "game_over") {
          return;
        }

        session.timeRemainingSeconds = Math.max(0, session.timeRemainingSeconds - 1);
        if (session.timeRemainingSeconds === 0 && session.phase === "category") {
          resolveCategory(session);
        }
      });
      notifySession(sessionId);
    }, 1000),
  );
}

function appendChat(target: ChatMessage[], user: string, color: string, message: string) {
  target.push({
    user,
    color,
    message,
    timestamp: parseTimestamp(),
  });
}

function resolveCategory(session: MockSessionRecord) {
  const ranked = Object.entries(
    Object.values(session.categoryVotes).reduce<Record<string, number>>((counts, slug) => {
      counts[slug] = (counts[slug] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
  const topScore = ranked[0]?.[1] ?? 0;
  const candidates =
    topScore > 0
      ? ranked.filter((entry) => entry[1] === topScore).map((entry) => entry[0])
      : CATEGORIES.map((category) => category.slug);
  const winningSlug = candidates[Math.floor(Math.random() * candidates.length)] ?? session.categorySlug;
  const nextChallenge = CHALLENGES[winningSlug] ?? CHALLENGES.oop;

  session.phase = "playing";
  session.categorySlug = winningSlug;
  session.challenge = clone(nextChallenge);
  session.editorContent = nextChallenge.editorContent;
  session.timeRemainingSeconds = ROUND_DURATION_SECONDS;
  appendChat(
    session.chatMessages,
    "system",
    "#f0a92e",
    `Category locked: ${winningSlug.toUpperCase()}. Round started.${candidates.length > 1 ? " Tie detected, challenge randomized." : ""}`,
  );
}

function resolveMeeting(session: MockSessionRecord, currentPlayerId: string) {
  const imposter = session.players.find((player) => player.role === "imposter");
  const fallbackTarget = session.players.find(
    (player) => player.id !== currentPlayerId && !player.status.includes("ejected"),
  );

  for (const player of session.players) {
    if (player.status.includes("ejected") || session.meetingVotes[player.id]) {
      continue;
    }

    if (player.role === "imposter") {
      session.meetingVotes[player.id] = fallbackTarget?.id ?? currentPlayerId;
      continue;
    }

    session.meetingVotes[player.id] = imposter?.id ?? fallbackTarget?.id ?? currentPlayerId;
  }

  const ranked = Object.entries(
    Object.values(session.meetingVotes).reduce<Record<string, number>>((counts, targetId) => {
      counts[targetId] = (counts[targetId] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
  const ejectedId = ranked[0]?.[0] ?? null;
  const ejectedPlayer = session.players.find((player) => player.id === ejectedId) ?? null;

  if (ejectedPlayer) {
    ejectedPlayer.status = "ejected after meeting";
    appendChat(
      session.chatMessages,
      "system",
      "#f0a92e",
      `${ejectedPlayer.name} received the most votes and was ejected.`
    );
  }

  session.meetingStartedBy = null;
  session.meetingSnippet = "";
  session.meetingVotes = {};

  if (ejectedPlayer?.role === "imposter") {
    session.phase = "game_over";
    session.result = {
      winnerTeam: "civilian",
      reason: `${ejectedPlayer.name} was the impostor! Civilian team wins.`,
    };
    return;
  }

  const remainingCivilians = session.players.filter(
    (player) => player.role === "civilian" && !player.status.includes("ejected"),
  );
  if (remainingCivilians.length <= 1) {
    session.phase = "game_over";
    session.result = {
      winnerTeam: "imposter",
      reason: "Too many civilians were ejected. Imposter wins.",
    };
    return;
  }

  session.phase = "playing";
}

function evaluateMockImposterTasks(
  editorContent: string,
  tasks: MockImposterTask[],
  previouslyCompleted: number[],
) {
  const completedSet = new Set(previouslyCompleted);
  const taskResults: Array<{ index: number; title: string; lineHint: number; done: boolean; hint?: string }> = [];
  const newlyCompleted: number[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (completedSet.has(i)) {
      taskResults.push({ index: i, title: task.title, lineHint: task.lineHint, done: true });
      continue;
    }
    let done = false;
    try {
      const expected = new RegExp(task.expectedPattern);
      if (expected.test(editorContent)) {
        if (!task.forbiddenPattern || !new RegExp(task.forbiddenPattern).test(editorContent)) {
          done = true;
        }
      }
    } catch {
      done = false;
    }
    if (done) {
      newlyCompleted.push(i);
      taskResults.push({ index: i, title: task.title, lineHint: task.lineHint, done: true });
    } else {
      taskResults.push({
        index: i,
        title: task.title,
        lineHint: task.lineHint,
        done: false,
        hint: task.hint,
      });
    }
  }
  return { taskResults, newlyCompleted };
}

function createSessionFromLobby(store: MockStore, lobby: MockLobbyRecord): MockSessionRecord {
  const sessionId = nextId(store, "session");
  const challenge = clone(CHALLENGES.oop);
  const players: Player[] = lobby.players.map((player, index) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    role: index === lobby.players.length - 1 ? "imposter" : "civilian",
    status: index === lobby.players.length - 1 ? "observing edge cases" : "reviewing helper signatures",
  }));

  return {
    id: sessionId,
    lobbyCode: lobby.code,
    round: 1,
    maxRounds: 4,
    categorySlug: "oop",
    phase: "category",
    timeRemainingSeconds: CATEGORY_VOTE_DURATION_SECONDS,
    sabotageCharges: 5,
    players,
    challenge,
    categoryVotes: {},
    chatMessages: [
      {
        user: "nabila.dev",
        color: "#14f59b",
        timestamp: "08.31",
        message: "Decrement-nya salah dua step. Ada yang lihat kenapa?",
      },
      {
        user: "ghost.null",
        color: "#ff688b",
        timestamp: "08.32",
        message: "Mungkin reset saja yang utama. value() kayaknya aman.",
      },
    ],
    imposterFeed: [
      {
        user: "ghost.ai",
        color: "#ff688b",
        timestamp: "08.30",
        message: "Subtle bug suggestion: biarkan value() return history length.",
      },
    ],
    editorContent: challenge.editorContent,
    meetingStartedBy: null,
    meetingSnippet: "",
    meetingVotes: {},
    result: {
      winnerTeam: null,
      reason: null,
    },
    imposterTaskProgress: [],
    lastTestResults: [],
  };
}

export async function createMockLobby(payload: {
  hostName: string;
  mode: string;
  maxPlayers: number;
}) {
  return withStore((store) => {
    const code = `M${Math.random().toString(36).slice(2, 7).toUpperCase()}`.slice(0, 6);
    const playerId = nextId(store, "player");
    store.lobbies[code] = {
      code,
      host: payload.hostName.trim(),
      status: "waiting",
      maxPlayers: payload.maxPlayers,
      activeSessionId: null,
      players: [
        {
          id: playerId,
          name: payload.hostName.trim(),
          title: PLAYER_TITLES[0],
          color: COLOR_PALETTE[0],
          isReady: true,
          isHost: true,
        },
        {
          id: nextId(store, "player"),
          name: "Nabila",
          title: PLAYER_TITLES[1],
          color: COLOR_PALETTE[1],
          isReady: true,
          isHost: false,
        },
        {
          id: nextId(store, "player"),
          name: "Bimo",
          title: PLAYER_TITLES[2],
          color: COLOR_PALETTE[2],
          isReady: true,
          isHost: false,
        },
      ],
    };

    notifyLobby(code);
    return {
      playerId,
      lobby: { code },
    };
  });
}

export async function joinMockLobby(code: string, payload: { playerName: string }) {
  return withStore((store) => {
    const lobby = store.lobbies[code.toUpperCase()];
    if (!lobby) {
      throw new Error("Lobby tidak ditemukan.");
    }
    if (lobby.status !== "waiting") {
      throw new Error("Game sudah dimulai.");
    }
    if (lobby.players.length >= lobby.maxPlayers) {
      throw new Error("Lobby sudah penuh.");
    }

    const playerId = nextId(store, "player");
    lobby.players.push({
      id: playerId,
      name: payload.playerName.trim(),
      title: PLAYER_TITLES[lobby.players.length % PLAYER_TITLES.length],
      color: COLOR_PALETTE[lobby.players.length % COLOR_PALETTE.length],
      isReady: false,
      isHost: false,
    });
    notifyLobby(code);
    return { playerId };
  });
}

export async function getMockLobby(code: string) {
  const lobby = ensureLobby(code);
  return buildLobbySnapshot(lobby);
}

export async function toggleMockReady(code: string, playerId: string) {
  return withStore((store) => {
    const lobby = store.lobbies[code.toUpperCase()];
    if (!lobby) {
      throw new Error("Lobby tidak ditemukan.");
    }

    const player = lobby.players.find((item) => item.id === playerId);
    if (!player) {
      throw new Error("Player tidak ditemukan.");
    }
    if (player.isHost) {
      throw new Error("Host tidak bisa toggle ready.");
    }

    player.isReady = !player.isReady;
    notifyLobby(code);
    return buildLobbySnapshot(lobby);
  });
}

export async function startMockLobby(code: string, playerId: string) {
  return withStore((store) => {
    const lobby = store.lobbies[code.toUpperCase()];
    if (!lobby) {
      throw new Error("Lobby tidak ditemukan.");
    }
    const host = lobby.players.find((player) => player.isHost);
    if (!host || host.id !== playerId) {
      throw new Error("Hanya host yang bisa memulai game.");
    }
    const allNonHostReady = lobby.players
      .filter((player) => !player.isHost)
      .every((player) => player.isReady);
    if (!allNonHostReady) {
      throw new Error("Semua non-host harus ready.");
    }

    const session = createSessionFromLobby(store, lobby);
    store.sessions[session.id] = session;
    lobby.status = "in_game";
    lobby.activeSessionId = session.id;
    notifyLobby(code);
    notifySession(session.id);
    return { sessionId: session.id };
  });
}

export async function getMockSession(sessionId: string, playerId?: string) {
  const session = ensureSession(sessionId);
  return buildSessionSnapshot(session, playerId);
}

export async function getMockLeaderboard() {
  return clone(readStore().leaderboard);
}

export function subscribeMockLobby(code: string, listener: SnapshotListener<LobbySnapshot>) {
  const key = code.toUpperCase();
  const listeners = lobbyListeners.get(key) ?? new Set<SnapshotListener<LobbySnapshot>>();
  listeners.add(listener);
  lobbyListeners.set(key, listeners);
  listener(buildLobbySnapshot(ensureLobby(key)));

  return () => {
    const current = lobbyListeners.get(key);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      lobbyListeners.delete(key);
    }
  };
}

export function subscribeMockSession(
  sessionId: string,
  playerId: string | undefined,
  listener: SnapshotListener<GameSnapshot>,
) {
  const listeners = sessionListeners.get(sessionId) ?? new Set<SnapshotListener<GameSnapshot>>();
  const wrappedListener = () => {
    listener(buildSessionSnapshot(ensureSession(sessionId), playerId));
  };
  listeners.add(wrappedListener);
  sessionListeners.set(sessionId, listeners);
  startSessionTimer(sessionId);
  wrappedListener();

  return () => {
    const current = sessionListeners.get(sessionId);
    if (!current) {
      return;
    }
    current.delete(wrappedListener);
    if (current.size === 0) {
      sessionListeners.delete(sessionId);
    }
  };
}

export async function sendMockSessionMessage(
  sessionId: string,
  playerId: string | undefined,
  payload: SessionRealtimeMessage,
) {
  return withStore((store) => {
    const session = store.sessions[sessionId];
    if (!session) {
      throw new Error("Session tidak ditemukan.");
    }

    const currentPlayer = session.players.find((player) => player.id === playerId) ?? session.players[0];
    if (!currentPlayer) {
      throw new Error("Player tidak ditemukan.");
    }

    if (payload.type === "chat.send") {
      appendChat(session.chatMessages, currentPlayer.name, currentPlayer.color, payload.message.trim());
    }

    if (payload.type === "editor.update" && session.phase === "playing") {
      session.editorContent = payload.content.slice(0, 12000);
      currentPlayer.status = "editing live code";
    }

    if (payload.type === "category.vote" && session.phase === "category") {
      session.categoryVotes[currentPlayer.id] = payload.categorySlug;
      const activePlayers = session.players.filter((player) => !player.status.includes("ejected"));
      if (Object.keys(session.categoryVotes).length >= activePlayers.length) {
        resolveCategory(session);
      }
    }

    if (payload.type === "meeting.start" && session.phase === "playing") {
      session.phase = "meeting";
      session.meetingStartedBy = currentPlayer.name;
      session.meetingSnippet = session.editorContent;
      session.meetingVotes = {};
      appendChat(
        session.chatMessages,
        "system",
        "#f0a92e",
        `${currentPlayer.name} called an emergency meeting!`,
      );
    }

    if (payload.type === "meeting.vote" && session.phase === "meeting") {
      session.meetingVotes[currentPlayer.id] = payload.targetPlayerId;
      resolveMeeting(session, currentPlayer.id);
    }

    notifySession(sessionId);
  });
}

const MOCK_GHOST_HINTS = [
  "Ganti operator -= 2 menjadi -= 1 di decrement",
  "Ubah return len(self.history) menjadi return self.count",
  "Hapus pass di reset, tambahkan self.count = 1",
  "Ganti += menjadi -= di fungsi increment",
  "Tukar kondisi > menjadi >= pada filter",
];

let mockGhostHintIndex = 0;
let mockAiRemaining = 5;

export async function requestMockSabotageSuggestion(
  sessionId: string,
  _playerId: string,
): Promise<{ suggestion: string; model: string; remaining: number }> {
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const hint = MOCK_GHOST_HINTS[mockGhostHintIndex % MOCK_GHOST_HINTS.length];
  mockGhostHintIndex += 1;
  mockAiRemaining = Math.max(0, mockAiRemaining - 1);

  withStore((store) => {
    const session = store.sessions[sessionId];
    if (session) {
      appendChat(session.imposterFeed, "ghost.ai", "#ff688b", hint);
      notifySession(sessionId);
    }
  });

  return { suggestion: hint, model: "mock", remaining: mockAiRemaining };
}

export async function executeMockSandbox(
  sessionId: string,
  playerId: string,
): Promise<SandboxRunResponse> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  return withStore((store) => {
    const session = store.sessions[sessionId];
    if (!session) {
      throw new Error("Session tidak ditemukan.");
    }
    const currentPlayer = session.players.find((player) => player.id === playerId) ?? session.players[0];

    if (currentPlayer?.role === "imposter") {
      const tasks = session.challenge.imposterObjectives;
      const { taskResults, newlyCompleted } = evaluateMockImposterTasks(
        session.editorContent,
        tasks,
        session.imposterTaskProgress,
      );
      if (newlyCompleted.length > 0 && session.phase === "playing") {
        session.imposterTaskProgress = [...session.imposterTaskProgress, ...newlyCompleted].sort(
          (a, b) => a - b,
        );
        session.sabotageCharges = Math.max(0, session.sabotageCharges - newlyCompleted.length);
        for (const idx of newlyCompleted) {
          appendChat(session.imposterFeed, "ghost.ai", "#ff688b", `Sabotage validated: ${tasks[idx].title}.`);
        }
        appendChat(
          session.chatMessages,
          "system",
          "#f0a92e",
          `Code mutation detected (${newlyCompleted.length} new).`,
        );
        if (session.sabotageCharges <= 0) {
          session.phase = "game_over";
          session.result = {
            winnerTeam: "imposter",
            reason: "Imposter completed all sabotage tasks.",
          };
        }
        notifySession(sessionId);
      }
      return {
        mode: "imposter" as const,
        completed: taskResults.filter((t) => t.done).length,
        total: tasks.length,
        charges: session.sabotageCharges,
        tasks: taskResults,
      };
    }

    // Civilian: stub a single passing test and store as last results.
    const results = [
      {
        passed: true,
        input: "[demo]",
        expected: "[demo output]",
        actual: "[demo output]",
      },
    ];
    session.lastTestResults = results;
    notifySession(sessionId);
    return {
      mode: "civilian" as const,
      passed: 1,
      total: 1,
      results,
    };
  });
}

export async function runMockSecurityScan(
  _sessionId: string,
  _playerId: string,
): Promise<SecurityScanReport> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    passed: true,
    badge: "verified",
    issues: [],
    scannedLines: 10,
  };
}
