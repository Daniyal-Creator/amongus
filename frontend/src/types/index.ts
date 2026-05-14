export type PlayerRole = "civilian" | "imposter";

export type LobbyPlayer = {
  id: string;
  name: string;
  title: string;
  color: string;
  isReady: boolean;
  isHost: boolean;
};

export type Player = {
  id: string;
  name: string;
  color: string;
  role: PlayerRole;
  status: string;
  meetingVotes?: number;
};

export type CategoryOption = {
  slug: string;
  name: string;
  description: string;
  votes: number;
  roundEstimate: string;
};

export type LeaderboardEntry = {
  username: string;
  category: string;
  score: number;
  record: string;
};

export type HallOfFameEntry = {
  title: string;
  player: string;
  description: string;
  tone: "accent" | "danger" | "success" | "warning";
};

export type GameObjective = {
  title: string;
  description: string;
  done: boolean;
  lineHint?: number;
};

export type ChatMessage = {
  user: string;
  color: string;
  timestamp: string;
  message: string;
};

export type RoundStateItem = {
  label: string;
  value: string;
};

export type ChallengeTest = {
  name?: string;
  setup?: string;
  expression?: string;
  input?: string;
  expected: unknown;
};

export type EditorLine = {
  number: number;
  content: string;
};

export type LobbySnapshot = {
  host: string;
  status: string;
  maxPlayers: number;
  players: LobbyPlayer[];
  categories: CategoryOption[];
  activeSessionId: string | null;
};

export type LeaderboardSnapshot = {
  leaderboardEntries: LeaderboardEntry[];
  hallOfFame: HallOfFameEntry[];
};

export type GameSnapshot = {
  phase: "category" | "playing" | "meeting" | "game_over";
  round: number;
  maxRounds: number;
  category: string;
  timeRemaining: string;
  sabotageCharges: number;
  currentUser: {
    id: string;
    role: PlayerRole;
    roleDescription: string;
  };
  challenge: {
    title: string;
    description: string;
    language: string;
    difficulty: string;
    tests: ChallengeTest[];
  };
  categoryVoteOptions: CategoryOption[];
  players: Player[];
  objectives: GameObjective[];
  imposterObjectives: GameObjective[];
  chatMessages: ChatMessage[];
  imposterFeed: ChatMessage[];
  editorContent: string;
  editorLines: EditorLine[];
  currentCategoryVote: string | null;
  meeting: {
    startedBy: string | null;
    snippet: string;
    currentVoteTargetId: string | null;
  };
  result: {
    winnerTeam: "civilian" | "imposter" | null;
    reason: string | null;
  };
  cursors?: CursorPresence[];
};

export type CursorPresence = {
  playerId: string;
  name: string;
  color: string;
  anchor: number;
  head: number;
};

export type SecurityScanIssue = {
  rule: string;
  severity: "low" | "medium" | "high";
  line: number;
  excerpt: string;
  message: string;
};

export type SecurityScanReport = {
  passed: boolean;
  badge: "verified" | "needs_review" | "vulnerable";
  issues: SecurityScanIssue[];
  scannedLines: number;
};

export type SandboxTestResult = {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error?: string;
};

export type CivilianRunResponse = {
  mode: "civilian";
  passed: number;
  total: number;
  results: SandboxTestResult[];
};

export type ImposterTaskResult = {
  index: number;
  title: string;
  lineHint: number;
  done: boolean;
  hint?: string;
};

export type ImposterValidationResponse = {
  mode: "imposter";
  completed: number;
  total: number;
  charges: number;
  tasks: ImposterTaskResult[];
};

export type SandboxRunResponse = CivilianRunResponse | ImposterValidationResponse;

export type AiSabotageSuggestResponse = {
  suggestion: string;
  model: string;
  remaining: number;
};

export type AiPoisoningResponse = {
  poisonedHint: string;
  usedFallback: boolean;
  remaining: number;
};

export type GameReviewResponse = {
  review: string;
  model: string;
  cached: boolean;
};

export type CategoryLeaderboardResponse = {
  category: string;
  entries: LeaderboardEntry[];
};

export type TournamentEntry = {
  player_name: string;
  score: number;
  wins: number;
  games: number;
};

