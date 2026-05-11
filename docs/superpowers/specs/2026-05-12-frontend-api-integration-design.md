# Frontend API Integration Design

Comprehensive integration of 6 backend APIs into the Among Us Coder UI using Feature Hooks + Composable Panels architecture, with design system tokens from `.agents/skills/ckm-design-system`.

## Overview

The backend has 6 fully implemented API systems with no frontend UI connections:

| API | Backend Route | Frontend `api.ts` Function | UI Component | Status |
|-----|--------------|---------------------------|--------------|--------|
| Sandbox | `POST /api/sessions/:id/execute` | `executeSandbox()` | None | Not integrated |
| AI Assist | `POST /api/ai/sabotage-suggest`, `POST /api/ai/activate-poisoning` | `requestSabotageSuggestion()`, `activateCopilotPoisoning()` | None | Not integrated |
| Security Scanner | `POST /api/sessions/:id/security-scan` | `runSecurityScan()` | None | Not integrated |
| Leaderboard Filter | `GET /api/leaderboard/:category`, `GET /api/leaderboard/tournament` | `getCategoryLeaderboard()`, `getTournamentLeaderboard()` | None | Not integrated |
| Cursor Presence | WS `editor.cursor` + `session.cursors` | `connectSession()` already handles | No cursor rendering | Partial |
| Game Review | `GET /api/game/:id/review` | `getGameReview()` | None | Not integrated |

## Architecture

```
frontend/src/
  hooks/
    use-sandbox.ts
    use-security-scan.ts
    use-ai-assist.ts
    use-game-review.ts
    use-cursor-presence.ts
  components/game/panels/
    SandboxPanel.tsx
    SecurityPanel.tsx
    AiAssistPanel.tsx
    GameReviewPanel.tsx
    CursorOverlay.tsx
  components/leaderboard/
    LeaderboardFilters.tsx
  __tests__/
    hooks/
      use-sandbox.test.ts
      use-security-scan.test.ts
      use-ai-assist.test.ts
      use-game-review.test.ts
      use-cursor-presence.test.ts
    panels/
      SandboxPanel.test.tsx
      SecurityPanel.test.tsx
      AiAssistPanel.test.tsx
      GameReviewPanel.test.tsx
      LeaderboardFilters.test.tsx
```

## Section 1: Design System Token Layer

Extend `globals.css` to bridge the pixel-art theme with the `.agents` 3-layer token architecture (primitive -> semantic -> component).

### New CSS Variables (`:root`)

```css
/* Semantic status tokens mapped to pixel palette */
--status-success-bg: #9ed46c;
--status-success-border: #6ab448;
--status-warning-bg: #f5c05e;
--status-warning-border: #d4a030;
--status-error-bg: #ef8d86;
--status-error-border: #c44a42;
--status-info-bg: #6da8ff;
--status-info-border: #4a87d9;

/* Component tokens for panels */
--panel-action-bg: var(--cream-dark);
--panel-action-hover: var(--cream);
--panel-result-bg: #fff8ea;
--panel-result-border: var(--brown);

/* State tokens */
--state-loading-opacity: 0.7;
--state-disabled-opacity: 0.5;

/* Cursor presence tokens */
--cursor-transition-duration: 80ms;
```

### New Utility Classes

```css
.pixel-badge              /* Inline badge: 3px border, brown, cream bg, 10px font */
.pixel-badge-success      /* bg: status-success-bg */
.pixel-badge-warning      /* bg: status-warning-bg */
.pixel-badge-danger       /* bg: status-error-bg */
.pixel-progress           /* Animated bar: cream-dark bg, green fill, 8px height */
.pixel-skeleton           /* Pulse animation placeholder: cream-dark bg */
.pixel-panel-result       /* Light result card: #fff8ea bg, brown border */
.pixel-tab                /* Tab button for leaderboard filter */
.pixel-tab-active         /* Active tab with bottom border highlight */
```

## Section 2: Hook Layer

Each hook follows the pattern: `{ data, loading, error, action }`.

### `use-sandbox.ts`

```typescript
type UseSandboxReturn = {
  results: SandboxRunResponse | null;
  loading: boolean;
  error: string | null;
  execute: (stdin?: string) => Promise<void>;
  reset: () => void;
};

function useSandbox(sessionId: string, playerId: string): UseSandboxReturn;
```

- Calls `executeSandbox(sessionId, playerId, stdin)` from `api.ts`.
- `reset()` clears results and error to allow re-run.
- Error messages extracted from API response or generic fallback.

### `use-security-scan.ts`

```typescript
type UseSecurityScanReturn = {
  report: SecurityScanReport | null;
  loading: boolean;
  error: string | null;
  scan: () => Promise<void>;
};

function useSecurityScan(sessionId: string, playerId: string): UseSecurityScanReturn;
```

- Calls `runSecurityScan(sessionId, playerId)` from `api.ts`.
- Result persists until next scan is triggered.

### `use-ai-assist.ts`

```typescript
type UseAiAssistReturn = {
  suggestion: AiSabotageSuggestResponse | null;
  poisonResult: AiPoisoningResponse | null;
  loading: boolean;
  error: string | null;
  remaining: number | null;
  requestSuggestion: () => Promise<void>;
  activatePoison: () => Promise<void>;
};

function useAiAssist(sessionId: string, playerId: string): UseAiAssistReturn;
```

- Tracks `remaining` from response to show rate limit counter.
- Both actions share the `loading` state (only one AI request at a time).
- Imposter-only — component guards visibility, but hook also returns early if called for civilians.

### `use-game-review.ts`

```typescript
type UseGameReviewReturn = {
  review: GameReviewResponse | null;
  loading: boolean;
  error: string | null;
  fetchReview: () => Promise<void>;
};

function useGameReview(sessionId: string): UseGameReviewReturn;
```

- Only callable when `phase === "game_over"`.
- Auto-fetches on mount when phase is game_over.
- Caches result (backend also caches in `session_reviews`).

### `use-cursor-presence.ts`

```typescript
type UseCursorPresenceReturn = {
  remoteCursors: CursorPresence[];
  sendCursorPosition: (anchor: number, head: number) => void;
};

function useCursorPresence(
  connection: SessionConnection | null,
  cursors: CursorPresence[],
  currentPlayerId: string
): UseCursorPresenceReturn;
```

- Filters out `currentPlayerId` from the cursor list.
- `sendCursorPosition` is debounced (50ms) to avoid flooding WebSocket.
- No API calls — reads from existing WebSocket `session.cursors` push.

## Section 3: Panel Components

### `SandboxPanel.tsx`

**Location in layout:** Below the code editor, inside the center column. Replaces the static challenge description bar.

**UI structure:**
```
┌──────────────────────────────────────────────────────┐
│ [description text]              [RUN CODE] [EMERGENCY/SABOTAGE] │
├──────────────────────────────────────────────────────┤
│ (Collapsible results area - only shown after run)    │
│  Test 1: ✓ PASS  input="..." expected="..." got="..."│
│  Test 2: ✗ FAIL  input="..." expected="..." got="..."│
│  ─────────────────────────────────────────           │
│  Passed: 1/2                                         │
└──────────────────────────────────────────────────────┘
```

**States:**
- **Idle:** Only the action bar with RUN CODE button visible.
- **Loading:** Button shows spinner, text changes to "Running...", opacity reduced.
- **Results:** Collapsible panel expands showing test results. Each test is a `pixel-panel-result` with pass/fail badge.
- **Error:** Red alert banner with error message and retry option.

**Props:**
```typescript
type SandboxPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
  description: string;
  isCivilian: boolean;
  sabotageCharges: number;
  onPrimaryAction: () => void;
};
```

### `SecurityPanel.tsx`

**Location in layout:** Left sidebar, below the objectives list. Only visible to civilians during `playing` phase.

**UI structure:**
```
┌───────────────────────┐
│ MedBay Scanner        │
│ [SCAN CODE]           │
├───────────────────────┤
│ (After scan)          │
│ Badge: [VERIFIED] ✓   │
│ Lines scanned: 17     │
│ Issues: 0             │
│                       │
│ (If issues found)     │
│ ⚠ eval() detected L5 │
│ ⚠ SQL concat L12     │
└───────────────────────┘
```

**States:**
- **Idle:** Scan button only.
- **Loading:** Progress bar animation, button disabled.
- **Results:** Badge (verified=green, needs_review=orange, vulnerable=red), issue list with severity indicators.

**Props:**
```typescript
type SecurityPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
  isCivilian: boolean;
};
```

### `AiAssistPanel.tsx`

**Location in layout:** Left sidebar, below objectives. Only visible to imposters during `playing` phase.

**UI structure:**
```
┌───────────────────────┐
│ Ghost AI              │
│ Remaining: 3/5        │
│                       │
│ [ASK GHOST]           │
│ [POISON COPILOT]      │
├───────────────────────┤
│ (After suggestion)    │
│ "Try swapping the     │
│  boundary check..."   │
├───────────────────────┤
│ (After poisoning)     │
│ ✓ Poisoned hint       │
│   injected to chat    │
└───────────────────────┘
```

**States:**
- **Idle:** Two action buttons with remaining counter.
- **Loading:** Active button shows spinner, both disabled.
- **Suggestion received:** Displays suggestion text in a `pixel-panel-result`.
- **Poison activated:** Success confirmation with indicator.
- **Rate limited:** Buttons disabled with "Rate limited" text.

**Props:**
```typescript
type AiAssistPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
};
```

### `GameReviewPanel.tsx`

**Location in layout:** Inside the game_over overlay, below the player grid and above the "BACK TO HOME" button.

**UI structure:**
```
┌─────────────────────────────────────┐
│ AI Post-Game Review                 │
│ ┌─────────────────────────────────┐ │
│ │ (Loading: skeleton lines)       │ │
│ │                                 │ │
│ │ (Loaded: formatted review text) │ │
│ │ "Verdict: civilian team —..."   │ │
│ │ "Refactor suggestions:..."      │ │
│ │                                 │ │
│ │ Model: llama3  Cached: No       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**States:**
- **Loading:** 4-line skeleton placeholder with pulse animation.
- **Loaded:** Formatted review text. Model name and cached status as small chips.
- **Error:** Fallback message with retry button.

**Props:**
```typescript
type GameReviewPanelProps = {
  sessionId: string;
};
```

### `CursorOverlay.tsx`

**Not a panel** — this is a CodeMirror extension that renders remote cursors as colored decorations in the editor.

**Implementation approach:**
- Export a function `createCursorExtension(cursors: CursorPresence[])` that returns a CodeMirror `Extension`.
- Uses `StateField` + `Decoration` to render colored cursor lines and name labels at each remote player's position.
- Cursor labels appear as small colored tags above the cursor line (e.g., "Nabila" in teal).
- Smooth transitions via CSS `transition: left var(--cursor-transition-duration)`.
- Reconfigured when `cursors` array changes via `EditorView.updateListener`.

**Integration into CodeEditor.tsx:**
- `CodeEditor` receives a new optional prop `remoteCursors: CursorPresence[]`.
- The extension is added to the CodeMirror extensions list.
- Uses `useEffect` to reconfigure the extension when cursors change via compartment.

### `LeaderboardFilters.tsx`

**Location:** Replaces the current static leaderboard page content.

**UI structure:**
```
┌─────────────────────────────────────────────┐
│ LEADERBOARD                                 │
│                                             │
│ [All] [DSA] [OOP] [Web Dev] [Tournament]    │  ← pixel-tab buttons
│                                             │
│ ┌─ Weekly Ranking ──────┐ ┌─ Hall of Fame ─┐│  ← when "All" selected
│ │ (existing layout)     │ │ (existing)     ││
│ └───────────────────────┘ └────────────────┘│
│                                             │
│ ┌─ DSA Ranking ─────────────────────────────┐│  ← when category selected
│ │ #1 rayyan.exe    1540                     ││
│ │ #2 salsa.null    1480                     ││
│ └───────────────────────────────────────────┘│
│                                             │
│ ┌─ Tournament (7-day) ──────────────────────┐│  ← when Tournament selected
│ │ #1 rayyan.exe   Score:1540  W:9  Games:10 ││
│ └───────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

**Data flow:**
- "All" tab: calls existing `getLeaderboard()` — shows current 2-column layout.
- Category tabs: calls `getCategoryLeaderboard(slug)` — shows single-column filtered list.
- "Tournament" tab: calls `getTournamentLeaderboard()` — shows rolling 7-day aggregate.
- Active tab stored in local state. Categories fetched from existing `getLeaderboard()` response or hardcoded from known slugs.

## Section 4: GameSessionClient Composition

The existing `GameSessionClient.tsx` changes are minimal — it becomes a compositor:

### New state additions:
```typescript
const [cursors, setCursors] = useState<CursorPresence[]>([]);
```

### WebSocket cursor handler:
The existing `connectSession` call already supports `onCursors` callback — just wire it:
```typescript
sessionConnectionRef.current = connectSession(sessionId, playerId ?? undefined, {
  onSnapshot: (nextSnapshot) => { /* existing */ },
  onCursors: (nextCursors) => setCursors(nextCursors),  // NEW
  onError: () => { /* existing */ },
});
```

### Layout changes:

**Center column — action bar replacement:**
Replace the static description bar at the bottom of the editor with `<SandboxPanel>`. This component contains the description, RUN CODE button, and the existing EMERGENCY/SABOTAGE button, plus the collapsible test results area.

**Left sidebar — below objectives:**
Conditionally render `<SecurityPanel>` (civilians) or `<AiAssistPanel>` (imposters).

**Editor — cursor decorations:**
Pass `remoteCursors` to `<CodeEditor>` and `sendCursorPosition` to the editor's update listener.

**Game Over overlay:**
Add `<GameReviewPanel>` inside the existing game_over overlay section.

**No new state management in GameSessionClient** — each panel manages its own state via hooks.

## Section 5: Error Handling Strategy

All hooks follow this pattern:

```typescript
try {
  setLoading(true);
  setError(null);
  const result = await apiCall();
  setData(result);
} catch (err) {
  setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
} finally {
  setLoading(false);
}
```

**User-facing error messages:**
- 429 rate limit: "Batas request tercapai. Coba lagi dalam beberapa detik."
- 403 forbidden: "Aksi ini tidak tersedia untuk role kamu."
- 502 AI unavailable: "AI service sedang tidak tersedia." (with fallback content if returned by API)
- Network errors: "Koneksi gagal. Periksa jaringan kamu."

**Error display pattern:**
Each panel renders errors inline as a red-bordered `pixel-panel` with the message and a retry button (re-calls the action).

## Section 6: Testing Strategy

### Unit Tests (hooks)

Each hook tested with a mock of the corresponding `api.ts` function:

```typescript
// Pattern for all hook tests:
// 1. Mock api.ts function
// 2. Render hook with renderHook()
// 3. Call the action
// 4. Assert loading → true, then data populated, loading → false
// 5. Test error path: mock rejection, assert error string populated
// 6. Test edge cases (rate limit, phase guard)
```

**Test count per hook:** ~4-6 tests (success, error, loading states, edge cases).

### Component Tests (panels)

Each panel tested with React Testing Library:

```typescript
// Pattern for all panel tests:
// 1. Mock the hook return value
// 2. Render component with test props
// 3. Assert initial state (button visible, no results)
// 4. Simulate click, assert loading state
// 5. Update mock to return results, assert display
// 6. Test error display and retry
// 7. Test phase/role guards (component not rendered when conditions don't match)
```

**Test count per panel:** ~5-8 tests (render, action, loading, results, error, guards).

### Integration Tests

One integration test per feature that mounts `GameSessionClient` with mock API responses and verifies the full flow from button click to result display.

### Total estimated test count: ~60-70 tests

## Section 7: File Change Summary

### New files (17):
```
frontend/src/hooks/use-sandbox.ts
frontend/src/hooks/use-security-scan.ts
frontend/src/hooks/use-ai-assist.ts
frontend/src/hooks/use-game-review.ts
frontend/src/hooks/use-cursor-presence.ts
frontend/src/components/game/panels/SandboxPanel.tsx
frontend/src/components/game/panels/SecurityPanel.tsx
frontend/src/components/game/panels/AiAssistPanel.tsx
frontend/src/components/game/panels/GameReviewPanel.tsx
frontend/src/components/game/panels/CursorOverlay.ts
frontend/src/components/leaderboard/LeaderboardFilters.tsx
frontend/src/__tests__/hooks/use-sandbox.test.ts
frontend/src/__tests__/hooks/use-security-scan.test.ts
frontend/src/__tests__/hooks/use-ai-assist.test.ts
frontend/src/__tests__/hooks/use-game-review.test.ts
frontend/src/__tests__/hooks/use-cursor-presence.test.ts
frontend/src/__tests__/panels/SandboxPanel.test.tsx
frontend/src/__tests__/panels/SecurityPanel.test.tsx
frontend/src/__tests__/panels/AiAssistPanel.test.tsx
frontend/src/__tests__/panels/GameReviewPanel.test.tsx
frontend/src/__tests__/panels/LeaderboardFilters.test.tsx
```

### Modified files (4):
```
frontend/src/app/globals.css                    — new token variables + utility classes
frontend/src/components/editor/CodeEditor.tsx   — accept remoteCursors prop, add cursor extension
frontend/src/components/game/GameSessionClient.tsx — compose panels, wire onCursors callback
frontend/src/app/leaderboard/page.tsx           — replace content with LeaderboardFilters
```

### Not modified:
```
frontend/src/lib/api.ts     — all API functions already exist
frontend/src/types/index.ts — all types already defined
```
