# AI Agent: Debug & Test Imposter Sabotage Feature (Docker)

## Context

You are working on a multiplayer coding game called "code-mafia" (Among Us style).
The project lives at: /Users/ztrenggono/developer/competitionProject/amongus/

Project structure:
- frontend/   → Next.js 15 + TypeScript + Vitest (port 3000)
- backend/    → Fastify + TypeScript + PostgreSQL (port 4000)
- infra/      → docker-compose.yml (services: db, backend, frontend)

A major feature was recently implemented: **Imposter Sabotage Redesign**.
Your job is to:
1. Bring up the full stack with Docker
2. Run automated tests
3. Do end-to-end debugging of the new feature
4. Report all issues found with reproduction steps and suggested fixes

---

## What Was Changed (Feature Summary)

### Removed
- SABOTAGE button entirely eliminated
- `sabotage.use` WebSocket message type removed
- Generic imposter objectives with no specific instructions

### Added
- **5 concrete sabotage tasks per challenge** (14 challenges × 5 tasks = 70 tasks in seed data)
  - Each task has: `title`, `lineHint` (line number), `expectedPattern` (regex),
    `forbiddenPattern` (optional regex), `hint` (human-readable instruction)
- **New DB column**: `imposter_task_progress JSONB NOT NULL DEFAULT '[]'::jsonb` on `sessions` table
- **New file**: `backend/src/services/sabotage-validator.ts`
  - `validateImposterTasks(editorContent, tasks, previouslyCompleted)`
  - Regex-based per-task validation, persists completed task indices
- **New file**: `backend/src/services/session-effects.ts`
  - Extracted `appendSystemMessage()` and `appendImposterMessage()`
- **Rewritten**: `backend/src/routes/sandbox-routes.ts`
  - Same `/execute` endpoint, branches on player role
  - Imposter path: validate tasks → update DB → return `{ mode: "imposter", completed, total, charges, tasks }`
  - Civilian path: run tests → return `{ mode: "civilian", passed, total, results }`
- **Updated types** in `frontend/src/types/index.ts`:
  ```ts
  type CivilianRunResponse    = { mode: "civilian"; passed: number; total: number; results: SandboxTestResult[] }
  type ImposterValidationResponse = { mode: "imposter"; completed: number; total: number; charges: number; tasks: ImposterTaskResult[] }
  type SandboxRunResponse     = CivilianRunResponse | ImposterValidationResponse
  ```
- **Rewritten**: `frontend/src/components/game/panels/SandboxPanel.tsx`
  - "RUN CODE" for civilian, "VALIDATE BUG" for imposter
  - Imposter results: VALIDATED chip + task cards with lineHint + hint
  - Civilian results: PASSED chip + test cards (unchanged)
- **Updated**: `frontend/src/components/game/GameSessionClient.tsx`
  - Sidebar "(X/5) Sabotage Tasks" for imposter
  - Sub-header: "X charges left. Edit the code and click VALIDATE BUG."

---

## Phase 1: Environment Setup with Docker

### Step 1 — Verify Docker is running
```bash
docker info
docker compose version
```

### Step 2 — Tear down old state (IMPORTANT: DB schema changed)
```bash
cd /Users/ztrenggono/developer/competitionProject/amongus/infra
docker compose down -v   # -v removes the postgres-data volume so schema recreates fresh
```

### Step 3 — Build and bring up all services
```bash
docker compose up --build -d
```

### Step 4 — Wait for all services healthy, then verify
```bash
docker compose ps
# All 3 services should show "healthy" or "running"

# Check backend health
curl -s http://localhost:4000/health | python3 -m json.tool

# Check DB has the new column
docker compose exec db psql -U postgres -d amongus_coder \
  -c "\d sessions" | grep imposter_task_progress

# Check seed data has 70 imposter tasks total (5 per challenge)
docker compose exec db psql -U postgres -d amongus_coder \
  -c "SELECT category_slug, COUNT(*) FROM challenges GROUP BY category_slug;"
```

### Step 5 — Tail logs during testing
```bash
docker compose logs -f backend &
```

---

## Phase 2: Automated Tests (Frontend)

Run Vitest unit tests directly on the host (does not need Docker):

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus/frontend

# Run only the tests relevant to the new feature
npx vitest run src/__tests__/hooks/use-sandbox.test.ts
npx vitest run src/__tests__/panels/SandboxPanel.test.tsx

# Run full suite and capture failures
npx vitest run 2>&1 | tee /tmp/vitest-results.txt
```

**Expected passing tests in `use-sandbox.test.ts`:**
- starts with null results and no error
- sets loading while executing and returns results on success
- passes stdin to executeSandbox
- sets error on failure
- resets results and error
- stores imposter validation response when mode is imposter ← NEW

**Expected passing tests in `SandboxPanel.test.tsx`:**
- renders description and action buttons
- does not render SABOTAGE button for imposters ← NEW (replaces old test)
- shows VALIDATE BUG label for imposters ← NEW
- disables run button when phase is not playing
- calls executeSandbox on RUN CODE click and displays civilian results
- renders imposter task results when mode is imposter ← NEW
- shows error message on failure
- calls onPrimaryAction when emergency button clicked
- clears results on Clear click

Report any failing tests with full error output and stack trace.

---

## Phase 3: TypeScript Compilation Check

```bash
# Backend
cd /Users/ztrenggono/developer/competitionProject/amongus/backend
npx tsc --noEmit 2>&1 | tee /tmp/backend-tsc.txt

# Frontend
cd /Users/ztrenggono/developer/competitionProject/amongus/frontend
npx tsc --noEmit 2>&1 | tee /tmp/frontend-tsc.txt
```

All output should be empty (zero errors). Report any type errors found.

---

## Phase 4: API Integration Tests via curl

> **Auth contract note:** This API does NOT use `Authorization: Bearer` headers for session
> endpoints. Authentication is done by passing `playerId` (a UUID) in the request body.
> The `playerId` is returned at lobby create/join time. Sending an unknown `playerId` or
> omitting it entirely will return `400 body must have required property 'playerId'` — this
> is expected behaviour, not a missing auth guard.

### 4.1 Create a lobby
```bash
LOBBY=$(curl -s -X POST http://localhost:4000/api/lobbies \
  -H "Content-Type: application/json" \
  -d '{"playerName": "TestHost"}')
echo $LOBBY | python3 -m json.tool

LOBBY_ID=$(echo $LOBBY | python3 -c "import sys,json; print(json.load(sys.stdin)['lobbyId'])")
HOST_TOKEN=$(echo $LOBBY | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "LobbyID: $LOBBY_ID  HostToken: $HOST_TOKEN"
```

### 4.2 Second player joins
```bash
JOIN=$(curl -s -X POST http://localhost:4000/api/lobbies/$LOBBY_ID/join \
  -H "Content-Type: application/json" \
  -d '{"playerName": "TestPlayer2"}')
echo $JOIN | python3 -m json.tool
PLAYER2_TOKEN=$(echo $JOIN | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

### 4.3 Start game (host)
```bash
curl -s -X POST http://localhost:4000/api/lobbies/$LOBBY_ID/start \
  -H "Authorization: Bearer $HOST_TOKEN" | python3 -m json.tool
```

### 4.4 Get session snapshot to find SESSION_ID and player roles
```bash
HOST_SESSION=$(curl -s http://localhost:4000/api/sessions/me \
  -H "Authorization: Bearer $HOST_TOKEN")
echo $HOST_SESSION | python3 -m json.tool

SESSION_ID=$(echo $HOST_SESSION | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionId'])")
HOST_ROLE=$(echo $HOST_SESSION | python3 -c "import sys,json; print(json.load(sys.stdin)['role'])")
echo "SessionID: $SESSION_ID  HostRole: $HOST_ROLE"
```

### 4.5 Test CIVILIAN `/execute` endpoint
```bash
# Use whichever token belongs to the civilian
CIVILIAN_TOKEN=$HOST_TOKEN  # adjust if host is imposter

EXEC_RESULT=$(curl -s -X POST \
  http://localhost:4000/api/sessions/$SESSION_ID/execute \
  -H "Authorization: Bearer $CIVILIAN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": ""}')
echo $EXEC_RESULT | python3 -m json.tool
```

**Verify response shape:**
```json
{
  "mode": "civilian",
  "passed": 0,
  "total": 3,
  "results": [ ... ]
}
```
- `mode` MUST be `"civilian"` — if missing, the discriminated union is broken
- `results` must be an array of `{ passed, input, expected, actual, error? }`

### 4.6 Test IMPOSTER `/execute` endpoint
```bash
IMPOSTER_TOKEN=$PLAYER2_TOKEN  # adjust based on roles

VALIDATE_RESULT=$(curl -s -X POST \
  http://localhost:4000/api/sessions/$SESSION_ID/execute \
  -H "Authorization: Bearer $IMPOSTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": ""}')
echo $VALIDATE_RESULT | python3 -m json.tool
```

**Verify response shape:**
```json
{
  "mode": "imposter",
  "completed": 0,
  "total": 5,
  "charges": 5,
  "tasks": [
    {
      "index": 0,
      "title": "Reverse increment direction",
      "lineHint": 7,
      "done": false,
      "hint": "Cari `self.count += 1` di line 7, ganti `+=` jadi `-=`."
    }
  ]
}
```
- `mode` MUST be `"imposter"`
- `tasks` MUST have exactly 5 items
- Each task MUST have `index`, `title`, `lineHint`, `done`, and `hint` (when not done)

### 4.7 Test imposter task completion flow
```bash
# Get current challenge code from session snapshot
SNAPSHOT=$(curl -s http://localhost:4000/api/sessions/$SESSION_ID \
  -H "Authorization: Bearer $IMPOSTER_TOKEN")
echo $SNAPSHOT | python3 -c "import sys,json; s=json.load(sys.stdin); print(s.get('editorContent','')[:500])"

# Apply sabotage to task 0 (e.g. replace += with -=) and submit
curl -s -X POST \
  http://localhost:4000/api/sessions/$SESSION_ID/execute \
  -H "Authorization: Bearer $IMPOSTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "PASTE_SABOTAGED_CODE_HERE"}' | python3 -m json.tool
```

### 4.8 Verify DB persistence of completed tasks
```bash
docker compose exec db psql -U postgres -d amongus_coder \
  -c "SELECT id, imposter_task_progress, sabotage_charges FROM sessions;"
# imposter_task_progress should contain [0] after task 0 is completed
```

---

## Phase 5: Regression Checks

### 5.1 Verify `sabotage.use` WS message is gone
```bash
grep -r "sabotage.use" \
  /Users/ztrenggono/developer/competitionProject/amongus/backend/src \
  /Users/ztrenggono/developer/competitionProject/amongus/frontend/src
# Expected: zero results
```

### 5.2 Verify `applySabotage` is gone from mock-api
```bash
grep -n "applySabotage" \
  /Users/ztrenggono/developer/competitionProject/amongus/frontend/src/lib/mock-api.ts
# Expected: zero results
```

### 5.3 Verify seed data has 5 tasks per challenge (70 total)
```bash
grep -c "expectedPattern" \
  /Users/ztrenggono/developer/competitionProject/amongus/backend/src/seed-data.ts
# Expected: 70
```

### 5.4 Verify DB column exists and is JSONB
```bash
docker compose exec db psql -U postgres -d amongus_coder \
  -c "SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name='sessions' AND column_name='imposter_task_progress';"
# Expected: 1 row, data_type = jsonb
```

### 5.5 Check backend logs for runtime errors
```bash
docker compose logs backend 2>&1 | grep -iE "error|exception|unhandled|fatal" | tail -30
```

---

## Phase 6: Edge Case Tests

### 6.1 Rate limit enforcement
```bash
# Hit /execute 6 times rapidly — 6th call should return rate limit error
for i in $(seq 1 6); do
  echo -n "Attempt $i: "
  curl -s -X POST http://localhost:4000/api/sessions/$SESSION_ID/execute \
    -H "Authorization: Bearer $CIVILIAN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"code":""}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('mode', r.get('message','???')))"
done
```

### 6.2 Missing / unknown playerId
```bash
# No playerId → schema validation error
curl -s -X POST http://localhost:4000/api/sessions/$SESSION_ID/execute \
  -H "Content-Type: application/json" \
  -d '{"code":""}' | python3 -m json.tool
# Expected: 400 body must have required property 'playerId'

# Unknown playerId (not in session) → 404
curl -s -X POST http://localhost:4000/api/sessions/$SESSION_ID/execute \
  -H "Content-Type: application/json" \
  -d '{"playerId":"00000000-0000-0000-0000-000000000000","code":""}' | python3 -m json.tool
# Expected: 404 Player not in session.
```

### 6.3 Task persistence across reverted code
```bash
# 1. Complete task 0 (validate sabotaged code → task 0 done=true)
# 2. Submit original unmodified code again
# 3. task 0 must remain done=true (previouslyCompleted set prevents regression)
```

### 6.4 Phase guard (non-playing phase)
```bash
# If session is in "meeting" or "game_over" phase,
# /execute should return 403 or appropriate error — not run code
```

---

## What to Report

For **each issue found**, provide:

1. **Issue title** (one line)
2. **Severity**: Critical / High / Medium / Low
3. **Reproduction steps** (exact commands or UI actions)
4. **Actual result** (what happened)
5. **Expected result** (what should happen)
6. **Root cause** (file path + line number if identifiable)
7. **Suggested fix** (code snippet if possible)

End with a **Summary Table**:

| # | Area | Issue | Severity | Fixed? |
|---|------|-------|----------|--------|
| 1 | ...  | ...   | ...      | ...    |

If all checks in a phase pass, confirm with `✅ All checks passed — Phase N`.

---

## Key Files Reference

```
backend/src/
  index.ts                          ← main Fastify server, WS handler, publishSession, finishGame
  db.ts                             ← schema (sessions table has imposter_task_progress JSONB)
  seed-data.ts                      ← 70 imposter tasks (14 challenges × 5)
  routes/sandbox-routes.ts          ← /execute endpoint, role-branched logic
  services/sabotage-validator.ts    ← validateImposterTasks()
  services/session-effects.ts       ← appendSystemMessage(), appendImposterMessage()

frontend/src/
  types/index.ts                    ← SandboxRunResponse discriminated union
  lib/api.ts                        ← executeSandbox() API call
  lib/mock-api.ts                   ← mock mode, executeMockSandbox()
  hooks/use-sandbox.ts              ← useSandbox() hook
  components/game/panels/
    SandboxPanel.tsx                ← VALIDATE BUG / RUN CODE UI
  components/game/
    GameSessionClient.tsx           ← sidebar task list, charge count
  __tests__/
    hooks/use-sandbox.test.ts
    panels/SandboxPanel.test.tsx
```
