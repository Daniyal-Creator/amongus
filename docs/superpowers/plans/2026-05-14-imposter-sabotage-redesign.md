# Imposter Sabotage Workflow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-click `SABOTAGE` button with an edit-then-validate loop. Imposter receives 5 line-tied sabotage tasks per challenge; clicking RUN CODE validates which tasks have been planted and turns them green. Civilian RUN CODE additionally turns its 3 task cards green per-test.

**Architecture:** Single sandbox endpoint branches on role: civilian path keeps existing test runner; imposter path runs a new regex-based validator over editor content vs. seeded sabotage task definitions. Task completion is tracked in a new JSONB column on `sessions`. Charges decrement implicitly when a task validates; reaching 0 still triggers `finishGame(imposter, …)`.

**Tech Stack:** Fastify + Postgres (backend), Next.js 16 + Vitest + React Testing Library (frontend), TypeScript throughout.

**Spec:** [`docs/superpowers/specs/2026-05-14-imposter-sabotage-redesign-design.md`](../specs/2026-05-14-imposter-sabotage-redesign-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/db.ts` | Modify | Add `imposter_task_progress` column to `sessions` |
| `backend/src/seed-data.ts` | Modify | Replace `imposterObjectives` with 5-task line-tied shape for all 14 challenges |
| `backend/src/services/sabotage-validator.ts` | Create | Regex-based per-task validation against editor content |
| `backend/src/routes/sandbox-routes.ts` | Modify | Branch on role: civilian → existing tests, imposter → validator |
| `backend/src/index.ts` | Modify | Drop `sabotage.use` WS handler + `SABOTAGE_MUTATIONS`; compute `done` flags in snapshot |
| `frontend/src/types/index.ts` | Modify | Add `lineHint` + discriminated union for run-code response |
| `frontend/src/lib/api.ts` | Modify | Drop `sabotage.use` from `SessionRealtimeMessage`; widen `executeSandbox` return type |
| `frontend/src/lib/mock-api.ts` | Modify | Drop `sabotage.use` handler; mock imposter validation response |
| `frontend/src/hooks/use-sandbox.ts` | Modify | Widen `results` state to discriminated union |
| `frontend/src/components/game/panels/SandboxPanel.tsx` | Modify | Remove SABOTAGE button (imposter); branch result render on `mode` |
| `frontend/src/components/game/GameSessionClient.tsx` | Modify | Sidebar count uses tasks, not charges; drop sabotage primary action |
| `frontend/src/__tests__/panels/SandboxPanel.test.tsx` | Modify | Update mocks for discriminated response, remove SABOTAGE button assertion |
| `frontend/src/__tests__/hooks/use-sandbox.test.ts` | Modify | Match new return shape |

---

## Conventions used throughout

- All regex patterns are **JavaScript regex source strings** stored as `string` in seed data and compiled with `new RegExp(pattern)` server-side. **No flags** — patterns are matched against full `editor_content` as a single string.
- Indentation in seed code blocks is **4-space Python-style for `.py` challenges and 2-space for `.js` challenges** to match existing seed-data.ts.
- All TDD steps are skipped for backend code (no test infra exists in `backend/`); for backend changes, "verify" means `npx tsc --noEmit` + manual smoke. Frontend has Vitest, so frontend changes follow TDD.
- Commit after every task. Commit messages start with `feat:`, `refactor:`, or `chore:`.

---

## Task 1: Add `imposter_task_progress` column + frontend types

**Files:**
- Modify: `backend/src/db.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1.1: Add column to schema**

In `backend/src/db.ts`, find the `CREATE TABLE IF NOT EXISTS sessions (...)` block (around line 77) and add the column. Replace the `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` line so it becomes:

```sql
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      imposter_task_progress JSONB NOT NULL DEFAULT '[]'::jsonb
```

Then **after** the entire multi-table `CREATE TABLE` block ends (after the `CREATE INDEX IF NOT EXISTS idx_leaderboard_history_week ...` line — find by searching for that index), add an idempotent ALTER for existing databases. Insert a new `await query(...)` call right after the big `await query(\`...\`)` schema call:

```ts
  await query(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS imposter_task_progress JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
```

- [ ] **Step 1.2: Extend GameObjective + add ImposterValidationResponse**

Replace the `GameObjective` and `SandboxRunResponse` exports in `frontend/src/types/index.ts` and add the new types:

```ts
export type GameObjective = {
  title: string;
  description: string;
  done: boolean;
  lineHint?: number;
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
```

- [ ] **Step 1.3: Drop sabotage.use from realtime message**

In `frontend/src/lib/api.ts`, find the `SessionRealtimeMessage` union (around line 39) and remove the trailing `| { type: "sabotage.use" };`. The new union ends with `| { type: "meeting.vote"; targetPlayerId: string };`.

- [ ] **Step 1.4: TypeScript type-check**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx tsc --noEmit`
Expected: Errors will appear (in `mock-api.ts` and consumer code). Note them — they will be resolved in later tasks. The point of this step is to confirm `types/index.ts` itself compiles.

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/backend && npx tsc --noEmit`
Expected: Clean compile (the SQL string change doesn't affect TS types).

- [ ] **Step 1.5: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/db.ts frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat: add imposter task progress column and discriminated run-code response

Adds sessions.imposter_task_progress (JSONB) for tracking which sabotage
tasks an imposter has validated. Frontend types now expose a discriminated
union covering civilian test results vs imposter task validation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Reseed OOP challenges with line-tied sabotage tasks

**Files:**
- Modify: `backend/src/seed-data.ts` (4 OOP challenges)

This rewrites the `imposterObjectives` arrays for `challenge-counter-oop-r1`, `challenge-stack-oop-r2`, `challenge-linkedlist-oop-r3`, `challenge-queue-oop-r4`. Each entry now carries `lineHint`, `expectedPattern`, optional `forbiddenPattern`, and `hint`.

- [ ] **Step 2.1: Replace Counter (OOP r1) imposter tasks**

In `backend/src/seed-data.ts`, find the `challenge-counter-oop-r1` block. Replace its `imposterObjectives: [...]` array with:

```ts
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
        title: "Off-by-one di guard amount",
        description: "Ubah `if amount < 0:` jadi `if amount <= 0:` di `increment_by`.",
        done: false,
        lineHint: 16,
        expectedPattern: "if\\s+amount\\s*<=\\s*0\\s*:",
        forbiddenPattern: "if\\s+amount\\s*<\\s*0\\s*:",
        hint: "Cari `if amount < 0:` di line 16, ganti `<` jadi `<=`.",
      },
      {
        title: "Balik arah accumulator",
        description: "Ubah `self.count += amount` jadi `self.count -= amount` di `increment_by`.",
        done: false,
        lineHint: 18,
        expectedPattern: "self\\.count\\s*-=\\s*amount",
        forbiddenPattern: "self\\.count\\s*\\+=\\s*amount",
        hint: "Cari `self.count += amount` di line 18, ganti `+=` jadi `-=`.",
      },
      {
        title: "Return value selalu False",
        description: "Ubah `return True` jadi `return False` di akhir `increment_by`.",
        done: false,
        lineHint: 19,
        expectedPattern: "return\\s+False",
        forbiddenPattern: "return\\s+True",
        hint: "Ubah `return True` di line 19 jadi `return False`.",
      },
    ],
```

- [ ] **Step 2.2: Replace MinStack (OOP r2) imposter tasks**

Find `challenge-stack-oop-r2` and replace its `imposterObjectives: [...]` with:

```ts
    imposterObjectives: [
      {
        title: "Komentari items.append di push",
        description: "Komentari baris `self.items.append(val)` di method `push`.",
        done: false,
        lineHint: 7,
        expectedPattern: "#\\s*self\\.items\\.append\\(val\\)",
        hint: "Tambahkan `# ` di depan `self.items.append(val)` di line 7.",
      },
      {
        title: "Balik komparator min",
        description: "Ubah `val >= self.min_stack[-1]` jadi `val < self.min_stack[-1]`.",
        done: false,
        lineHint: 9,
        expectedPattern: "val\\s*<\\s*self\\.min_stack\\[-1\\]",
        forbiddenPattern: "val\\s*>=\\s*self\\.min_stack\\[-1\\]",
        hint: "Ubah `val >= self.min_stack[-1]` jadi `val < self.min_stack[-1]` di line 9.",
      },
      {
        title: "Push konstanta ke min_stack",
        description: "Ubah `self.min_stack.append(val)` jadi `self.min_stack.append(0)`.",
        done: false,
        lineHint: 10,
        expectedPattern: "self\\.min_stack\\.append\\(0\\)",
        forbiddenPattern: "self\\.min_stack\\.append\\(val\\)",
        hint: "Ganti argumen `val` jadi `0` di line 10.",
      },
      {
        title: "Pop tanpa remove",
        description: "Ubah `val = self.items.pop()` jadi `val = self.items[-1]`.",
        done: false,
        lineHint: 16,
        expectedPattern: "val\\s*=\\s*self\\.items\\[-1\\]",
        forbiddenPattern: "val\\s*=\\s*self\\.items\\.pop\\(\\)",
        hint: "Ubah `self.items.pop()` jadi `self.items[-1]` di line 16.",
      },
      {
        title: "Return min dari index salah",
        description: "Ubah `return self.min_stack[-1]` jadi `return self.min_stack[0]`.",
        done: false,
        lineHint: 24,
        expectedPattern: "return\\s+self\\.min_stack\\[0\\]",
        forbiddenPattern: "return\\s+self\\.min_stack\\[-1\\]",
        hint: "Ubah index `-1` jadi `0` di line 24.",
      },
    ],
```

- [ ] **Step 2.3: Replace LinkedList (OOP r3) imposter tasks**

Find `challenge-linkedlist-oop-r3` and replace:

```ts
    imposterObjectives: [
      {
        title: "Off-by-one boundary insert",
        description: "Ubah `index > self.length` jadi `index >= self.length` di `insert_at`.",
        done: false,
        lineHint: 13,
        expectedPattern: "index\\s*>=\\s*self\\.length",
        forbiddenPattern: "index\\s*>\\s*self\\.length",
        hint: "Ubah `>` jadi `>=` di line 13 (boundary check insert_at).",
      },
      {
        title: "Komentari length increment di insert head",
        description: "Komentari `self.length += 1` di branch `index == 0` pada `insert_at`.",
        done: false,
        lineHint: 19,
        expectedPattern: "#\\s*self\\.length\\s*\\+=\\s*1",
        hint: "Tambahkan `# ` di depan `self.length += 1` di line 19.",
      },
      {
        title: "Self-loop pointer",
        description: "Ubah `curr.next = node` jadi `curr.next = curr` di `insert_at`.",
        done: false,
        lineHint: 25,
        expectedPattern: "curr\\.next\\s*=\\s*curr(?!\\.)",
        forbiddenPattern: "curr\\.next\\s*=\\s*node",
        hint: "Ubah `curr.next = node` jadi `curr.next = curr` di line 25.",
      },
      {
        title: "Patch head ke dirinya sendiri",
        description: "Ubah `self.head = self.head.next` jadi `self.head = self.head` di `delete_at`.",
        done: false,
        lineHint: 35,
        expectedPattern: "self\\.head\\s*=\\s*self\\.head(?!\\.)",
        forbiddenPattern: "self\\.head\\s*=\\s*self\\.head\\.next",
        hint: "Hapus `.next` di line 35 — `self.head = self.head`.",
      },
      {
        title: "Skip wrong node di delete",
        description: "Ubah `curr.next = deleted.next` jadi `curr.next = deleted` di `delete_at`.",
        done: false,
        lineHint: 42,
        expectedPattern: "curr\\.next\\s*=\\s*deleted(?!\\.)",
        forbiddenPattern: "curr\\.next\\s*=\\s*deleted\\.next",
        hint: "Hapus `.next` di line 42 — `curr.next = deleted`.",
      },
    ],
```

- [ ] **Step 2.4: Replace CircularQueue (OOP r4) imposter tasks**

Find `challenge-queue-oop-r4` and replace:

```ts
    imposterObjectives: [
      {
        title: "Komentari is_full guard",
        description: "Komentari guard `if self.is_full():` di `enqueue` agar push past capacity.",
        done: false,
        lineHint: 10,
        expectedPattern: "#\\s*if\\s+self\\.is_full\\(\\)",
        hint: "Tambahkan `# ` di depan `if self.is_full():` di line 10.",
      },
      {
        title: "Komentari assignment queue",
        description: "Komentari `self.queue[self.rear] = val` di `enqueue`.",
        done: false,
        lineHint: 12,
        expectedPattern: "#\\s*self\\.queue\\[self\\.rear\\]\\s*=\\s*val",
        hint: "Tambahkan `# ` di depan `self.queue[self.rear] = val` di line 12.",
      },
      {
        title: "Loncat dua di size",
        description: "Ubah `self.size += 1` di `enqueue` jadi `self.size += 2`.",
        done: false,
        lineHint: 15,
        expectedPattern: "self\\.size\\s*\\+=\\s*2",
        hint: "Ganti `1` jadi `2` di line 15 (`self.size += 2`).",
      },
      {
        title: "Hapus modular pada front",
        description: "Ubah `self.front = (self.front + 1) % self.capacity` jadi `self.front = self.front + 1`.",
        done: false,
        lineHint: 23,
        expectedPattern: "self\\.front\\s*=\\s*self\\.front\\s*\\+\\s*1\\s*\\n",
        forbiddenPattern: "self\\.front\\s*=\\s*\\(self\\.front\\s*\\+\\s*1\\)\\s*%\\s*self\\.capacity",
        hint: "Hapus `()` dan `% self.capacity` di line 23.",
      },
      {
        title: "Komentari size decrement",
        description: "Komentari `self.size -= 1` di `dequeue`.",
        done: false,
        lineHint: 24,
        expectedPattern: "#\\s*self\\.size\\s*-=\\s*1",
        hint: "Tambahkan `# ` di depan `self.size -= 1` di line 24.",
      },
    ],
```

- [ ] **Step 2.5: Type-check + commit**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/backend && npx tsc --noEmit`
Expected: Errors about missing `expectedPattern`/`hint`/`lineHint` properties on the `imposterObjectives` shape. Those are fine — TypeScript infers the type from the literal, so the compiler will treat the new shape as the new inferred type. No code consuming these fields exists yet.

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/seed-data.ts
git commit -m "$(cat <<'EOF'
feat(seed): convert OOP imposter objectives to line-tied sabotage tasks

Each of the 4 OOP challenges now has 5 concrete sabotage tasks with
expectedPattern (regex on editor content), optional forbiddenPattern,
lineHint for the hint UI, and human-readable hint text.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Reseed DSA challenges

**Files:**
- Modify: `backend/src/seed-data.ts` (4 DSA challenges)

- [ ] **Step 3.1: Replace sumRange (DSA r1) imposter tasks**

Find `challenge-sum-range-dsa-r1` and replace:

```ts
    imposterObjectives: [
      {
        title: "Geser nilai awal accumulator",
        description: "Ubah `let total = 0;` jadi `let total = 1;`.",
        done: false,
        lineHint: 6,
        expectedPattern: "let\\s+total\\s*=\\s*1\\b",
        forbiddenPattern: "let\\s+total\\s*=\\s*0\\b",
        hint: "Ubah `0` jadi `1` di line 6 (`let total = 1;`).",
      },
      {
        title: "Switch fallback default",
        description: "Ubah `values[index] || 0` jadi `values[index] || 1`.",
        done: false,
        lineHint: 10,
        expectedPattern: "values\\[index\\]\\s*\\|\\|\\s*1\\b",
        forbiddenPattern: "values\\[index\\]\\s*\\|\\|\\s*0\\b",
        hint: "Ubah fallback `|| 0` jadi `|| 1` di line 10.",
      },
      {
        title: "Return invalid jadi 0",
        description: "Ubah `return null;` (di guard non-array) jadi `return 0;`.",
        done: false,
        lineHint: 3,
        expectedPattern: "return\\s+0\\s*;",
        forbiddenPattern: "return\\s+null\\s*;",
        hint: "Ubah `return null;` di line 3 jadi `return 0;`.",
      },
      {
        title: "Lompat dua langkah loop",
        description: "Ubah `index += 1` jadi `index += 2` di for-loop.",
        done: false,
        lineHint: 9,
        expectedPattern: "index\\s*\\+=\\s*2",
        forbiddenPattern: "index\\s*\\+=\\s*1",
        hint: "Ubah `index += 1` jadi `index += 2` di line 9.",
      },
      {
        title: "Balik ternary return",
        description: "Tukar urutan ternary jadi `return total == 0 ? total : null;`.",
        done: false,
        lineHint: 14,
        expectedPattern: "return\\s+total\\s*==\\s*0\\s*\\?\\s*total\\s*:\\s*null",
        forbiddenPattern: "return\\s+total\\s*==\\s*0\\s*\\?\\s*null\\s*:\\s*total",
        hint: "Tukar `null` dan `total` di ternary line 14.",
      },
    ],
```

- [ ] **Step 3.2: Replace binarySearch (DSA r2) imposter tasks**

Find `challenge-binary-search-dsa-r2` and replace:

```ts
    imposterObjectives: [
      {
        title: "Pindah low awal",
        description: "Ubah `let low = 0;` jadi `let low = 1;`.",
        done: false,
        lineHint: 2,
        expectedPattern: "let\\s+low\\s*=\\s*1\\b",
        forbiddenPattern: "let\\s+low\\s*=\\s*0\\b",
        hint: "Ubah `0` jadi `1` di line 2.",
      },
      {
        title: "Off-by-one high",
        description: "Hapus `- 1` di high init jadi `let high = arr.length;`.",
        done: false,
        lineHint: 3,
        expectedPattern: "let\\s+high\\s*=\\s*arr\\.length\\s*;",
        forbiddenPattern: "let\\s+high\\s*=\\s*arr\\.length\\s*-\\s*1",
        hint: "Hapus `- 1` di line 3 (`let high = arr.length;`).",
      },
      {
        title: "Strict bound while",
        description: "Ubah `low <= high` jadi `low < high`.",
        done: false,
        lineHint: 5,
        expectedPattern: "while\\s*\\(\\s*low\\s*<\\s*high\\s*\\)",
        forbiddenPattern: "while\\s*\\(\\s*low\\s*<=\\s*high\\s*\\)",
        hint: "Ubah `<=` jadi `<` di while line 5.",
      },
      {
        title: "Stale low pointer",
        description: "Ubah `low = mid + 1;` jadi `low = mid;`.",
        done: false,
        lineHint: 13,
        expectedPattern: "low\\s*=\\s*mid\\s*;",
        forbiddenPattern: "low\\s*=\\s*mid\\s*\\+\\s*1",
        hint: "Hapus `+ 1` di line 13.",
      },
      {
        title: "Stale high pointer",
        description: "Ubah `high = mid - 1;` jadi `high = mid;`.",
        done: false,
        lineHint: 15,
        expectedPattern: "high\\s*=\\s*mid\\s*;",
        forbiddenPattern: "high\\s*=\\s*mid\\s*-\\s*1",
        hint: "Hapus `- 1` di line 15.",
      },
    ],
```

- [ ] **Step 3.3: Replace mergeSorted (DSA r3) imposter tasks**

Find `challenge-merge-sorted-dsa-r3` and replace:

```ts
    imposterObjectives: [
      {
        title: "Skip first element arr1",
        description: "Ubah `let i = 0;` jadi `let i = 1;`.",
        done: false,
        lineHint: 3,
        expectedPattern: "let\\s+i\\s*=\\s*1\\b",
        forbiddenPattern: "let\\s+i\\s*=\\s*0\\b",
        hint: "Ubah `0` jadi `1` di line 3.",
      },
      {
        title: "Loop OR operator",
        description: "Ubah `&&` di kondisi while jadi `||`.",
        done: false,
        lineHint: 6,
        expectedPattern: "i\\s*<\\s*arr1\\.length\\s*\\|\\|\\s*j\\s*<\\s*arr2\\.length",
        forbiddenPattern: "i\\s*<\\s*arr1\\.length\\s*&&\\s*j\\s*<\\s*arr2\\.length",
        hint: "Ubah `&&` jadi `||` di kondisi while line 6.",
      },
      {
        title: "Komentari push arr1",
        description: "Komentari `result.push(arr1[i]);` di branch if.",
        done: false,
        lineHint: 9,
        expectedPattern: "//\\s*result\\.push\\(arr1\\[i\\]\\)",
        hint: "Tambahkan `// ` di depan `result.push(arr1[i]);` di line 9.",
      },
      {
        title: "Push wrong source di else",
        description: "Ubah `result.push(arr2[j]);` di else jadi `result.push(arr1[i]);`.",
        done: false,
        lineHint: 12,
        expectedPattern: "}\\s+else\\s+\\{\\s*\\n\\s*result\\.push\\(arr1\\[i\\]\\)",
        hint: "Ubah `arr2[j]` jadi `arr1[i]` di line 12 (branch else).",
      },
      {
        title: "Return array kosong",
        description: "Ubah `return result;` jadi `return [];`.",
        done: false,
        lineHint: 25,
        expectedPattern: "return\\s+\\[\\s*\\]\\s*;",
        forbiddenPattern: "return\\s+result\\s*;",
        hint: "Ubah `return result;` jadi `return [];` di line 25.",
      },
    ],
```

- [ ] **Step 3.4: Replace flatten (DSA r4) imposter tasks**

Find `challenge-flatten-dsa-r4` and replace:

```ts
    imposterObjectives: [
      {
        title: "Seed result dengan arr",
        description: "Ubah `const result = [];` jadi `const result = [arr];`.",
        done: false,
        lineHint: 2,
        expectedPattern: "const\\s+result\\s*=\\s*\\[arr\\]",
        forbiddenPattern: "const\\s+result\\s*=\\s*\\[\\s*\\]",
        hint: "Tambahkan `arr` di dalam array literal line 2 — `const result = [arr];`.",
      },
      {
        title: "Negate isArray check",
        description: "Tambahkan `!` di depan `Array.isArray(item)`.",
        done: false,
        lineHint: 5,
        expectedPattern: "if\\s*\\(\\s*!\\s*Array\\.isArray\\(item\\)\\s*\\)",
        forbiddenPattern: "if\\s*\\(\\s*Array\\.isArray\\(item\\)\\s*\\)",
        hint: "Tambahkan `!` jadi `if (!Array.isArray(item))` di line 5.",
      },
      {
        title: "Push container alih-alih sub",
        description: "Ubah `result.push(sub);` jadi `result.push(item);`.",
        done: false,
        lineHint: 8,
        expectedPattern: "for\\s*\\(\\s*const\\s+sub\\s+of\\s+item\\s*\\)\\s*\\{\\s*\\n\\s*result\\.push\\(item\\)",
        hint: "Ubah `sub` jadi `item` di line 8 (`result.push(item);`).",
      },
      {
        title: "Komentari push item di else",
        description: "Komentari `result.push(item);` di branch else.",
        done: false,
        lineHint: 11,
        expectedPattern: "//\\s*result\\.push\\(item\\)",
        hint: "Tambahkan `// ` di depan `result.push(item);` di line 11.",
      },
      {
        title: "Return arr asli",
        description: "Ubah `return result;` jadi `return arr;`.",
        done: false,
        lineHint: 15,
        expectedPattern: "return\\s+arr\\s*;",
        forbiddenPattern: "return\\s+result\\s*;",
        hint: "Ubah `return result;` jadi `return arr;` di line 15.",
      },
    ],
```

- [ ] **Step 3.5: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/seed-data.ts
git commit -m "$(cat <<'EOF'
feat(seed): convert DSA imposter objectives to line-tied sabotage tasks

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Reseed Web Dev challenges

**Files:**
- Modify: `backend/src/seed-data.ts` (4 Web Dev challenges)

- [ ] **Step 4.1: Replace dark-mode toggle (Web Dev r1)**

Find `challenge-dom-toggle-webdev-r1` and replace:

```ts
    imposterObjectives: [
      {
        title: "Ganti localStorage key init",
        description: "Ubah `getItem('Theme')` jadi `getItem('theme_v2')`.",
        done: false,
        lineHint: 3,
        expectedPattern: "getItem\\(['\"]theme_v2['\"]\\)",
        forbiddenPattern: "getItem\\(['\"]Theme['\"]\\)",
        hint: "Ubah string `'Theme'` jadi `'theme_v2'` di line 3.",
      },
      {
        title: "Inversi cek saved",
        description: "Ubah `saved === 'dark'` jadi `saved !== 'dark'`.",
        done: false,
        lineHint: 4,
        expectedPattern: "saved\\s*!==\\s*['\"]dark['\"]",
        forbiddenPattern: "saved\\s*===\\s*['\"]dark['\"]",
        hint: "Ubah `===` jadi `!==` di line 4.",
      },
      {
        title: "Toggle jadi remove",
        description: "Ubah `classList.add('dark')` di `toggleTheme` jadi `classList.remove('dark')`.",
        done: false,
        lineHint: 11,
        expectedPattern: "document\\.body\\.classList\\.remove\\(['\"]dark['\"]\\)",
        hint: "Ubah `.add('dark')` jadi `.remove('dark')` di line 11 (di dalam `toggleTheme`).",
      },
      {
        title: "Cek class dengan kapital",
        description: "Ubah `classList.contains('dark')` jadi `classList.contains('Dark')`.",
        done: false,
        lineHint: 12,
        expectedPattern: "classList\\.contains\\(['\"]Dark['\"]\\)",
        hint: "Kapitalisasi `dark` jadi `Dark` di line 12.",
      },
      {
        title: "Komentari setItem",
        description: "Komentari `localStorage.setItem(...)` agar preference tidak tersimpan.",
        done: false,
        lineHint: 13,
        expectedPattern: "//\\s*localStorage\\.setItem",
        hint: "Tambahkan `// ` di depan `localStorage.setItem(...)` di line 13.",
      },
    ],
```

- [ ] **Step 4.2: Replace fetch handler (Web Dev r2)**

Find `challenge-fetch-webdev-r2` and replace:

```ts
    imposterObjectives: [
      {
        title: "Buang await fetch",
        description: "Hapus `await` sebelum `fetch('/api/users')`.",
        done: false,
        lineHint: 2,
        expectedPattern: "const\\s+response\\s*=\\s*fetch\\(",
        forbiddenPattern: "const\\s+response\\s*=\\s*await\\s+fetch",
        hint: "Hapus keyword `await` di line 2 sehingga jadi `const response = fetch('/api/users');`.",
      },
      {
        title: "Ganti endpoint API",
        description: "Ubah path `/api/users` jadi `/api/admin`.",
        done: false,
        lineHint: 2,
        expectedPattern: "fetch\\(['\"]/api/admin['\"]",
        forbiddenPattern: "fetch\\(['\"]/api/users['\"]",
        hint: "Ubah string `/api/users` jadi `/api/admin` di line 2.",
      },
      {
        title: "Parse jadi text",
        description: "Ubah `response.json()` jadi `response.text()`.",
        done: false,
        lineHint: 6,
        expectedPattern: "response\\.text\\(\\)",
        forbiddenPattern: "response\\.json\\(\\)",
        hint: "Ubah `.json()` jadi `.text()` di line 6.",
      },
      {
        title: "Rename variabel data",
        description: "Ubah `const data` jadi `const payload` di assignment parse.",
        done: false,
        lineHint: 6,
        expectedPattern: "const\\s+payload\\s*=\\s*response\\.",
        hint: "Rename `data` jadi `payload` di line 6 (`const payload = response.text();`).",
      },
      {
        title: "Return null statis",
        description: "Ubah `return data;` jadi `return null;`.",
        done: false,
        lineHint: 8,
        expectedPattern: "return\\s+null\\s*;",
        forbiddenPattern: "return\\s+(data|payload)\\s*;",
        hint: "Ubah `return data;` jadi `return null;` di line 8.",
      },
    ],
```

- [ ] **Step 4.3: Replace form validation (Web Dev r3)**

Find `challenge-form-webdev-r3` and replace:

```ts
    imposterObjectives: [
      {
        title: "Inversi cek empty name",
        description: "Ubah `name === ''` jadi `name !== ''`.",
        done: false,
        lineHint: 8,
        expectedPattern: "name\\s*!==\\s*['\"]['\"]",
        forbiddenPattern: "name\\s*===\\s*['\"]['\"]",
        hint: "Ubah `===` jadi `!==` di line 8.",
      },
      {
        title: "Flip valid flag di branch name error",
        description: "Ubah `valid: false` jadi `valid: true` pada return `Name is required`.",
        done: false,
        lineHint: 9,
        expectedPattern: "\\{\\s*valid:\\s*true,\\s*error:\\s*['\"]Name is required['\"]",
        forbiddenPattern: "\\{\\s*valid:\\s*false,\\s*error:\\s*['\"]Name is required['\"]",
        hint: "Ubah `valid: false` jadi `valid: true` di line 9.",
      },
      {
        title: "Hapus negation email check",
        description: "Hapus `!` dari `if (!email.includes('@'))`.",
        done: false,
        lineHint: 12,
        expectedPattern: "if\\s*\\(\\s*email\\.includes\\(['\"]@['\"]\\)\\s*\\)",
        forbiddenPattern: "if\\s*\\(\\s*!\\s*email\\.includes\\(['\"]@['\"]\\)\\s*\\)",
        hint: "Hapus `!` di line 12 jadi `if (email.includes('@'))`.",
      },
      {
        title: "Kosongkan pesan error email",
        description: "Ubah string error `'Invalid email'` jadi `''`.",
        done: false,
        lineHint: 13,
        expectedPattern: "error:\\s*['\"]['\"]",
        forbiddenPattern: "error:\\s*['\"]Invalid email['\"]",
        hint: "Ganti `'Invalid email'` jadi `''` di line 13.",
      },
      {
        title: "Return success jadi false",
        description: "Ubah `valid: true` di return akhir jadi `valid: false`.",
        done: false,
        lineHint: 16,
        expectedPattern: "\\{\\s*valid:\\s*false,\\s*data:",
        forbiddenPattern: "\\{\\s*valid:\\s*true,\\s*data:",
        hint: "Ubah `valid: true` jadi `valid: false` di line 16 (return success).",
      },
    ],
```

- [ ] **Step 4.4: Replace event delegation (Web Dev r4)**

Find `challenge-event-webdev-r4` and replace:

```ts
    imposterObjectives: [
      {
        title: "Ganti event.target ke currentTarget",
        description: "Ubah `return event.target;` jadi `return event.currentTarget;`.",
        done: false,
        lineHint: 3,
        expectedPattern: "return\\s+event\\.currentTarget",
        forbiddenPattern: "return\\s+event\\.target\\s*;",
        hint: "Ubah `event.target` jadi `event.currentTarget` di line 3.",
      },
      {
        title: "Get wrong dataset key",
        description: "Ubah `button.dataset.action` jadi `button.dataset.id`.",
        done: false,
        lineHint: 8,
        expectedPattern: "button\\.dataset\\.id\\b",
        forbiddenPattern: "button\\.dataset\\.action\\b",
        hint: "Ubah `.action` jadi `.id` di line 8.",
      },
      {
        title: "Pass null ke findActionButton",
        description: "Ubah `findActionButton(event)` jadi `findActionButton(null)`.",
        done: false,
        lineHint: 12,
        expectedPattern: "findActionButton\\(\\s*null\\s*\\)",
        forbiddenPattern: "findActionButton\\(\\s*event\\s*\\)",
        hint: "Ubah argumen `event` jadi `null` di line 12.",
      },
      {
        title: "Hardcode handleEvent jadi null",
        description: "Ubah `return getAction(button);` jadi `return null;`.",
        done: false,
        lineHint: 13,
        expectedPattern: "return\\s+null\\s*;",
        forbiddenPattern: "return\\s+getAction\\(button\\)",
        hint: "Ubah `return getAction(button);` jadi `return null;` di line 13.",
      },
      {
        title: "Komentari findActionButton call",
        description: "Komentari baris `const button = findActionButton(...)`.",
        done: false,
        lineHint: 12,
        expectedPattern: "//\\s*const\\s+button\\s*=\\s*findActionButton",
        hint: "Tambahkan `// ` di depan `const button = findActionButton(...)` di line 12.",
      },
    ],
```

- [ ] **Step 4.5: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/seed-data.ts
git commit -m "$(cat <<'EOF'
feat(seed): convert Web Dev imposter objectives to line-tied sabotage tasks

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Reseed Speedrun challenges

**Files:**
- Modify: `backend/src/seed-data.ts` (2 Speedrun challenges)

- [ ] **Step 5.1: Replace FizzBuzz (Speedrun r1)**

Find `challenge-fizzbuzz-speedrun-r1` and replace:

```ts
    imposterObjectives: [
      {
        title: "Mulai loop dari 0",
        description: "Ubah `let i = 1` jadi `let i = 0` di for-loop.",
        done: false,
        lineHint: 4,
        expectedPattern: "let\\s+i\\s*=\\s*0\\s*;",
        forbiddenPattern: "let\\s+i\\s*=\\s*1\\s*;",
        hint: "Ubah `1` jadi `0` di for-loop line 4.",
      },
      {
        title: "Modulo salah Fizz",
        description: "Ubah `i % 3 === 0` jadi `i % 4 === 0`.",
        done: false,
        lineHint: 6,
        expectedPattern: "i\\s*%\\s*4\\s*===\\s*0",
        forbiddenPattern: "i\\s*%\\s*3\\s*===\\s*0",
        hint: "Ubah `% 3` jadi `% 4` di line 6.",
      },
      {
        title: "Lowercase Fizz",
        description: "Ubah `'Fizz'` jadi `'fizz'`.",
        done: false,
        lineHint: 7,
        expectedPattern: "result\\.push\\(['\"]fizz['\"]\\)",
        forbiddenPattern: "result\\.push\\(['\"]Fizz['\"]\\)",
        hint: "Ubah `'Fizz'` jadi `'fizz'` di line 7.",
      },
      {
        title: "Uppercase Buzz",
        description: "Ubah `'Buzz'` jadi `'BUZZ'`.",
        done: false,
        lineHint: 9,
        expectedPattern: "result\\.push\\(['\"]BUZZ['\"]\\)",
        forbiddenPattern: "result\\.push\\(['\"]Buzz['\"]\\)",
        hint: "Ubah `'Buzz'` jadi `'BUZZ'` di line 9.",
      },
      {
        title: "Geser konversi String",
        description: "Ubah `String(i)` jadi `String(i + 1)`.",
        done: false,
        lineHint: 13,
        expectedPattern: "String\\(i\\s*\\+\\s*1\\)",
        forbiddenPattern: "String\\(i\\)(?!\\s*\\+)",
        hint: "Ubah `String(i)` jadi `String(i + 1)` di line 13.",
      },
    ],
```

- [ ] **Step 5.2: Replace palindrome (Speedrun r2)**

Find `challenge-palindrome-speedrun-r2` and replace:

```ts
    imposterObjectives: [
      {
        title: "Skip first char",
        description: "Ubah `const cleaned = str;` jadi `const cleaned = str.slice(1);`.",
        done: false,
        lineHint: 4,
        expectedPattern: "const\\s+cleaned\\s*=\\s*str\\.slice\\(1\\)",
        forbiddenPattern: "const\\s+cleaned\\s*=\\s*str\\s*;",
        hint: "Tambahkan `.slice(1)` setelah `str` di line 4.",
      },
      {
        title: "Hapus reverse",
        description: "Hapus `.reverse()` dari rantai split-reverse-join.",
        done: false,
        lineHint: 5,
        expectedPattern: "cleaned\\.split\\([^)]*\\)\\.join\\(['\"]['\"]\\)",
        forbiddenPattern: "\\.reverse\\(\\)",
        hint: "Hapus `.reverse()` di line 5 sehingga jadi `cleaned.split('').join('')`.",
      },
      {
        title: "Split dengan spasi",
        description: "Ubah argumen `.split('')` jadi `.split(' ')`.",
        done: false,
        lineHint: 5,
        expectedPattern: "\\.split\\(['\"]\\s['\"]\\)",
        hint: "Ubah `.split('')` jadi `.split(' ')` (dengan satu spasi) di line 5.",
      },
      {
        title: "Inversi compare",
        description: "Ubah `cleaned === reversed` jadi `cleaned !== reversed`.",
        done: false,
        lineHint: 6,
        expectedPattern: "cleaned\\s*!==\\s*reversed",
        forbiddenPattern: "cleaned\\s*===\\s*reversed",
        hint: "Ubah `===` jadi `!==` di line 6.",
      },
      {
        title: "Bandingkan ke string asli",
        description: "Ubah RHS `reversed` jadi `str`.",
        done: false,
        lineHint: 6,
        expectedPattern: "return\\s+cleaned\\s*!==\\s*str\\s*;",
        forbiddenPattern: "return\\s+cleaned\\s*!==\\s*reversed",
        hint: "Ubah `reversed` jadi `str` di line 6 (`return cleaned !== str;`).",
      },
    ],
```

- [ ] **Step 5.3: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/seed-data.ts
git commit -m "$(cat <<'EOF'
feat(seed): convert Speedrun imposter objectives to line-tied sabotage tasks

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Backend sabotage validator service

**Files:**
- Create: `backend/src/services/sabotage-validator.ts`

- [ ] **Step 6.1: Create the validator module**

Create `backend/src/services/sabotage-validator.ts` with:

```ts
export type ImposterTaskDef = {
  title: string;
  description: string;
  done: boolean;
  lineHint: number;
  expectedPattern: string;
  forbiddenPattern?: string;
  hint: string;
};

export type ImposterTaskResult = {
  index: number;
  title: string;
  lineHint: number;
  done: boolean;
  hint?: string;
};

export type ImposterValidationResult = {
  tasks: ImposterTaskResult[];
  newlyCompleted: number[];
};

function compileSafe(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function evaluateTask(content: string, task: ImposterTaskDef): boolean {
  const expected = compileSafe(task.expectedPattern);
  if (!expected || !expected.test(content)) {
    return false;
  }
  if (task.forbiddenPattern) {
    const forbidden = compileSafe(task.forbiddenPattern);
    if (forbidden && forbidden.test(content)) {
      return false;
    }
  }
  return true;
}

/**
 * Validate the current editor against all imposter sabotage tasks.
 *
 * - Tasks already in `previouslyCompleted` are reported as `done: true`
 *   without re-running detection (so an imposter can't lose a completed
 *   task by editing past it).
 * - Returns the indexes that flipped from incomplete to complete in this
 *   call, so the caller can persist the new state and decrement charges.
 */
export function validateImposterTasks(
  editorContent: string,
  tasks: ImposterTaskDef[],
  previouslyCompleted: number[],
): ImposterValidationResult {
  const completedSet = new Set(previouslyCompleted);
  const results: ImposterTaskResult[] = [];
  const newlyCompleted: number[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (completedSet.has(i)) {
      results.push({
        index: i,
        title: task.title,
        lineHint: task.lineHint,
        done: true,
      });
      continue;
    }

    const done = evaluateTask(editorContent, task);
    if (done) {
      newlyCompleted.push(i);
      results.push({
        index: i,
        title: task.title,
        lineHint: task.lineHint,
        done: true,
      });
    } else {
      results.push({
        index: i,
        title: task.title,
        lineHint: task.lineHint,
        done: false,
        hint: task.hint,
      });
    }
  }

  return { tasks: results, newlyCompleted };
}
```

- [ ] **Step 6.2: Type-check + commit**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/backend && npx tsc --noEmit`
Expected: Clean compile.

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/services/sabotage-validator.ts
git commit -m "$(cat <<'EOF'
feat(backend): regex-based sabotage task validator

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Branch sandbox route on role + finishGame helper export

**Files:**
- Modify: `backend/src/routes/sandbox-routes.ts`
- Modify: `backend/src/index.ts` (export helpers)

- [ ] **Step 7.1: Export helpers from index.ts that the route needs**

The route needs to call `finishGame` and to broadcast snapshot updates. Both currently live as private functions inside `backend/src/index.ts`. To avoid pulling all of `index.ts` into the route, use a small shared module.

Create `backend/src/services/session-effects.ts`:

```ts
import { createId, query } from "../db.js";

export async function appendSystemMessage(sessionId: string, message: string) {
  await query(
    `
      INSERT INTO session_chat_messages (id, session_id, player_id, user_name, color, message)
      VALUES ($1, $2, NULL, 'system', '#f0a92e', $3)
    `,
    [createId(), sessionId, message],
  );
}

export async function appendImposterMessage(sessionId: string, message: string) {
  await query(
    `
      INSERT INTO session_imposter_messages (id, session_id, user_name, color, message)
      VALUES ($1, $2, 'ghost.ai', '#ff688b', $3)
    `,
    [createId(), sessionId, message],
  );
}
```

In `backend/src/index.ts`:
1. Replace the existing private `appendSystemMessage` and `appendImposterMessage` definitions with imports:
   ```ts
   import { appendSystemMessage, appendImposterMessage } from "./services/session-effects.js";
   ```
   Delete the original local function bodies (the two `async function` declarations near line 710).
2. Export `finishGame` and `publishSession` so the route can use them. Find their declarations (`async function finishGame(...)`, `async function publishSession(...)`) and prepend `export `:
   ```ts
   export async function finishGame(...
   export async function publishSession(...
   ```

- [ ] **Step 7.2: Update the sandbox route to branch**

Replace the entire contents of `backend/src/routes/sandbox-routes.ts` with:

```ts
import type { FastifyInstance } from "fastify";
import { createId, query } from "../db.js";
import { loadSessionRole } from "../services/auth-guard.js";
import { runChallengeTests, runTests, runCode } from "../services/sandbox.js";
import type { ChallengeTest } from "../services/sandbox.js";
import { rateLimit } from "../services/rate-limit.js";
import {
  validateImposterTasks,
  type ImposterTaskDef,
} from "../services/sabotage-validator.js";
import {
  appendImposterMessage,
  appendSystemMessage,
} from "../services/session-effects.js";
import { finishGame, publishSession } from "../index.js";

function isExpressionTest(t: unknown): t is ChallengeTest {
  return typeof t === "object" && t !== null && typeof (t as ChallengeTest).expression === "string";
}

function isImposterTaskDef(t: unknown): t is ImposterTaskDef {
  return (
    typeof t === "object" &&
    t !== null &&
    typeof (t as ImposterTaskDef).expectedPattern === "string" &&
    typeof (t as ImposterTaskDef).hint === "string" &&
    typeof (t as ImposterTaskDef).lineHint === "number"
  );
}

export function registerSandboxRoutes(app: FastifyInstance) {
  app.post<{
    Params: { sessionId: string };
    Body: { playerId: string; stdin?: string };
  }>(
    "/api/sessions/:sessionId/execute",
    {
      schema: {
        body: {
          type: "object",
          required: ["playerId"],
          properties: {
            playerId: { type: "string", minLength: 8 },
            stdin: { type: "string", maxLength: 4000 },
          },
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.params.sessionId;
      const playerId = request.body.playerId;
      const info = await loadSessionRole(sessionId, playerId);
      if (!info) return reply.code(404).send({ message: "Player not in session." });
      if (info.ejected) return reply.code(403).send({ message: "Ejected players cannot run code." });

      const rl = await rateLimit("exec", playerId, 5, 60);
      if (!rl.allowed) {
        return reply.code(429).send({ message: "Execution rate limit exceeded." });
      }

      const sessionRow = await query<{
        editor_content: string;
        language: string;
        tests: unknown[];
        imposter_objectives: unknown[];
        sabotage_charges: number;
        imposter_task_progress: number[];
        phase: string;
      }>(
        `
          SELECT s.editor_content, c.language, c.tests, c.imposter_objectives,
                 s.sabotage_charges, s.imposter_task_progress, s.phase
          FROM sessions s
          JOIN challenges c ON c.id = s.challenge_id
          WHERE s.id = $1
        `,
        [sessionId],
      );
      const session = sessionRow.rows[0];
      if (!session) return reply.code(404).send({ message: "Session not found." });

      /* ── Imposter path ── */
      if (info.role === "imposter") {
        const rawTasks = Array.isArray(session.imposter_objectives) ? session.imposter_objectives : [];
        const tasks = rawTasks.filter(isImposterTaskDef);
        if (tasks.length === 0) {
          return reply.code(500).send({ message: "Challenge has no imposter tasks configured." });
        }

        const previouslyCompleted = Array.isArray(session.imposter_task_progress)
          ? session.imposter_task_progress.filter((n: unknown): n is number => typeof n === "number")
          : [];

        const validation = validateImposterTasks(session.editor_content, tasks, previouslyCompleted);

        if (validation.newlyCompleted.length > 0 && session.phase === "playing") {
          const nextProgress = [...previouslyCompleted, ...validation.newlyCompleted].sort((a, b) => a - b);
          const nextCharges = Math.max(0, session.sabotage_charges - validation.newlyCompleted.length);

          await query(
            `
              UPDATE sessions
              SET imposter_task_progress = $2::jsonb,
                  sabotage_charges = $3
              WHERE id = $1
            `,
            [sessionId, JSON.stringify(nextProgress), nextCharges],
          );

          for (const idx of validation.newlyCompleted) {
            const task = tasks[idx];
            await query(
              `INSERT INTO session_sabotage_log (id, session_id, player_id, mutation_name, description, poisoned)
               VALUES ($1, $2, $3, $4, $5, FALSE)`,
              [createId(), sessionId, playerId, `task_${idx}`, task.title],
            );
            await appendImposterMessage(sessionId, `Sabotage validated: ${task.title}.`);
          }
          await appendSystemMessage(sessionId, `⚡ Code mutation detected (${validation.newlyCompleted.length} new).`);

          if (nextCharges <= 0) {
            await finishGame(
              sessionId,
              "imposter",
              "Imposter completed all sabotage tasks before civilians could stop them. 🔪",
            );
            // finishGame publishes the session.
          } else {
            await publishSession(sessionId);
          }
        }

        const completed = validation.tasks.filter((t) => t.done).length;
        const charges = Math.max(0, session.sabotage_charges - validation.newlyCompleted.length);
        return {
          mode: "imposter" as const,
          completed,
          total: tasks.length,
          charges,
          tasks: validation.tasks,
        };
      }

      /* ── Civilian path (existing behavior) ── */
      const rawTests = Array.isArray(session.tests) ? session.tests : [];
      const expressionTests = rawTests.filter(isExpressionTest);

      let results;
      if (expressionTests.length > 0) {
        results = await runChallengeTests(session.language, session.editor_content, expressionTests);
      } else if (rawTests.length > 0) {
        const legacyTests = (rawTests as Array<{ input?: string; expected?: string }>).map((t) => ({
          input: t.input ?? "",
          expected: t.expected ?? "",
        }));
        results = await runTests(session.language, session.editor_content, legacyTests);
      } else {
        const single = await runCode(session.language, session.editor_content, request.body.stdin ?? "");
        results = [
          {
            passed: single.ok,
            input: request.body.stdin ?? "",
            expected: "",
            actual: single.stdout,
            error: single.error ?? single.stderr,
          },
        ];
      }

      const passed = results.filter((r) => r.passed).length;
      await query(
        `INSERT INTO session_test_runs (id, session_id, player_id, passed_count, total_count, results)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [createId(), sessionId, playerId, passed, results.length, JSON.stringify(results)],
      );

      return {
        mode: "civilian" as const,
        passed,
        total: results.length,
        results,
      };
    },
  );
}
```

- [ ] **Step 7.3: Type-check**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/backend && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 7.4: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/routes/sandbox-routes.ts backend/src/services/session-effects.ts backend/src/index.ts
git commit -m "$(cat <<'EOF'
feat(backend): branch sandbox execute on player role

Imposter calls now run regex-based task validation instead of test execution.
Newly-validated tasks are logged, a system + imposter chat message is posted,
sabotage charges decrement, and reaching zero triggers an imposter win.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Compute `done` flags in session snapshot

**Files:**
- Modify: `backend/src/index.ts` (`getSessionSnapshot`)

- [ ] **Step 8.1: Update getSessionSnapshot to include done flags**

In `backend/src/index.ts`, locate the `getSessionSnapshot(sessionId, playerId?)` function. Two changes:

**(a) Add `imposter_task_progress` to the SELECT in the session query.** Find the first `query<{...}>(...)` call inside `getSessionSnapshot` (selecting from `sessions`). Add `imposter_task_progress: number[];` to its TypeScript row type, and add `imposter_task_progress` to the SELECT column list:

```ts
  const sessionResult = await query<{
    id: string;
    challenge_id: string;
    category_slug: string;
    phase: "category" | "playing" | "meeting" | "game_over";
    round: number;
    max_rounds: number;
    sabotage_charges: number;
    time_remaining_seconds: number;
    editor_content: string;
    meeting_started_by: string | null;
    meeting_snippet: string;
    winner_team: "civilian" | "imposter" | null;
    end_reason: string | null;
    imposter_task_progress: number[];
  }>(
    `
      SELECT
        id, challenge_id, category_slug, phase, round, max_rounds,
        sabotage_charges, time_remaining_seconds, editor_content,
        meeting_started_by, meeting_snippet, winner_team, end_reason,
        imposter_task_progress
      FROM sessions
      WHERE id = $1
    `,
    [sessionId],
  );
```

**(b) Add a parallel query for the latest test run for this player.** Inside the existing `Promise.all([...])` block (which fetches `playersResult`, `categories`, `challengeResult`, etc.), append one more query — the latest `session_test_runs` row for the current player. Add at the end of the array:

```ts
    query<{ results: unknown }>(
      `
        SELECT results
        FROM session_test_runs
        WHERE session_id = $1 AND player_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [session.id, playerId ?? ""],
    ),
```

Then destructure the new value at the end of the destructured assignment, e.g. `, latestTestRunResult`.

**(c) Compute the `done` flags.** Before the `return { ... }` at the bottom of `getSessionSnapshot`, add:

```ts
  const latestResults = (() => {
    const raw = latestTestRunResult.rows[0]?.results;
    if (!Array.isArray(raw)) return [];
    return raw as Array<{ passed?: boolean }>;
  })();

  const civilianObjectives = (challenge.objectives as Array<{ title: string; description: string }>).map(
    (objective, index) => ({
      ...objective,
      done: latestResults[index]?.passed === true,
    }),
  );

  const imposterTaskProgress = Array.isArray(session.imposter_task_progress)
    ? session.imposter_task_progress
    : [];
  const imposterObjectives = (
    challenge.imposter_objectives as Array<{
      title: string;
      description: string;
      lineHint?: number;
    }>
  ).map((objective, index) => ({
    title: objective.title,
    description: objective.description,
    lineHint: objective.lineHint,
    done: imposterTaskProgress.includes(index),
  }));
```

**(d) Replace the `objectives` and `imposterObjectives` fields in the returned object** with the computed ones:

```ts
    objectives: civilianObjectives,
    imposterObjectives: imposterObjectives,
```

(remove the previous `objectives: challenge.objectives,` and `imposterObjectives: challenge.imposter_objectives,` lines).

- [ ] **Step 8.2: Type-check**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/backend && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 8.3: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/index.ts
git commit -m "$(cat <<'EOF'
feat(backend): compute objective done flags from runs and task progress

Civilian objectives derive done state from the latest test run row;
imposter objectives derive from the new imposter_task_progress array.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Backend cleanup — drop sabotage.use WS handler + mutations

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 9.1: Remove SABOTAGE_MUTATIONS array and applySabotage**

In `backend/src/index.ts`, find the `/* ────────────── Sabotage mutations ────────────── */` section (around line 32). Delete the entire block from that comment through the end of the `function applySabotage(...)` definition (down to and including the closing `}` of `applySabotage`). Also delete the now-unused `import { randomInt } from "node:crypto";` at the top of the file ONLY if grep confirms it's unused after the deletion. Run:

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus/backend
grep -n "randomInt" src/index.ts
```

If `randomInt` is still used elsewhere (e.g. in `createCode`, category vote tie-breaking), keep the import.

- [ ] **Step 9.2: Remove the sabotage.use case from the WebSocket handler**

In `backend/src/index.ts`, find the WebSocket message handler (`realtimeSocket.on("message", ...)`). Two changes:

**(a)** In the `as` type cast for `data`, remove the `| { type: "sabotage.use" }` member. The cast becomes:
```ts
const data = JSON.parse(payload?.toString() ?? "") as
  | { type: "chat.send"; message: string }
  | { type: "editor.update"; content: string }
  | { type: "editor.cursor"; anchor: number; head: number }
  | { type: "category.vote"; categorySlug: string }
  | { type: "meeting.start" }
  | { type: "meeting.vote"; targetPlayerId: string };
```

**(b)** Delete the entire `/* ── Sabotage ── */` block (the `if (data.type === "sabotage.use") { ... }` block).

- [ ] **Step 9.3: Type-check**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/backend && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 9.4: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add backend/src/index.ts
git commit -m "$(cat <<'EOF'
refactor(backend): drop sabotage.use handler and auto-mutation engine

Sabotage is now driven by the imposter editing the buffer manually and
calling RUN CODE for validation. The WebSocket sabotage.use action and
the SABOTAGE_MUTATIONS array are no longer reachable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend mock-api parity

**Files:**
- Modify: `frontend/src/lib/mock-api.ts`

- [ ] **Step 10.1: Inspect mock-api types around imposterObjectives**

Read `frontend/src/lib/mock-api.ts` and locate every `imposterObjectives:` array — there are several inside the `CHALLENGES` constant. They use the OLD shape (no `lineHint` / `expectedPattern`). The mock store mirrors backend behavior.

- [ ] **Step 10.2: Convert mock CHALLENGES.oop imposterObjectives to the new shape**

For each `imposterObjectives:` array in `CHALLENGES` (oop, dsa, web-dev, algorithms-lite — whatever exists), replace with a 5-task array using the same structure used in seed-data.ts. **For the mock, use the OOP r1 (Counter) tasks from Task 2.1 verbatim** for `CHALLENGES.oop`. For other categories (dsa, web-dev, algorithms-lite), copy the relevant Task 3-5 task arrays. If a category in mock-api.ts doesn't have a 1:1 challenge match, use the OOP r1 task array as a fallback so the mock at least has 5 line-tied tasks.

- [ ] **Step 10.3: Drop sabotage.use case from mock send handler**

In `mock-api.ts`, find the `if (payload.type === "sabotage.use" && ...)` block (around line 968) and delete the entire block (through the matching closing brace).

- [ ] **Step 10.4: Add mock imposter validation in executeMockSandbox**

Find `executeMockSandbox` (search for `export async function executeMockSandbox` or `export function executeMockSandbox`). The current signature returns `SandboxRunResponse` (now a union). Update it to:

1. Determine if the calling player is an imposter (look up `currentPlayer.role`).
2. If civilian: keep current behavior, but wrap the existing return as `{ mode: "civilian" as const, passed, total, results }`.
3. If imposter: import and call `validateImposterTasks` from… **wait — mock-api runs in the browser**, not Node. We can't import the backend service. Inline the same logic:

```ts
type MockImposterTask = {
  title: string;
  description: string;
  done: boolean;
  lineHint: number;
  expectedPattern: string;
  forbiddenPattern?: string;
  hint: string;
};

function evaluateMockImposterTasks(
  editorContent: string,
  tasks: MockImposterTask[],
  previouslyCompleted: number[],
) {
  const completedSet = new Set(previouslyCompleted);
  const taskResults = [];
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
      taskResults.push({ index: i, title: task.title, lineHint: task.lineHint, done: false, hint: task.hint });
    }
  }
  return { tasks: taskResults, newlyCompleted };
}
```

The `MockSessionRecord` needs an `imposterTaskProgress: number[]` field — add it to the type and initialize to `[]` in `createSessionFromLobby`. Inside `executeMockSandbox`, when the caller is imposter:

```ts
  const tasks = session.challenge.imposterObjectives as MockImposterTask[];
  const { tasks: taskResults, newlyCompleted } = evaluateMockImposterTasks(
    session.editorContent,
    tasks,
    session.imposterTaskProgress,
  );
  if (newlyCompleted.length > 0 && session.phase === "playing") {
    session.imposterTaskProgress = [...session.imposterTaskProgress, ...newlyCompleted].sort((a, b) => a - b);
    session.sabotageCharges = Math.max(0, session.sabotageCharges - newlyCompleted.length);
    if (session.sabotageCharges <= 0) {
      session.phase = "game_over";
      session.result = { winnerTeam: "imposter", reason: "Imposter completed all sabotage tasks." };
    }
    notifySession(session.id);
  }
  return {
    mode: "imposter" as const,
    completed: taskResults.filter((t) => t.done).length,
    total: tasks.length,
    charges: session.sabotageCharges,
    tasks: taskResults,
  };
```

Also update `buildSessionSnapshot` to compute `done` for both objective arrays similarly to backend (Task 8): civilian objectives use the last test run results (mock store the last results in the session record as `lastTestResults`), imposter objectives use `imposterTaskProgress`.

For mock simplicity: store `lastTestResults: SandboxTestResult[] = []` on `MockSessionRecord`, set it inside `executeMockSandbox` civilian branch, and use it in `buildSessionSnapshot`:

```ts
  const objectives = session.challenge.objectives.map((objective: GameObjective, index: number) => ({
    ...objective,
    done: session.lastTestResults?.[index]?.passed === true,
  }));
  const imposterObjectives = session.challenge.imposterObjectives.map((objective, index) => ({
    title: objective.title,
    description: objective.description,
    lineHint: (objective as { lineHint?: number }).lineHint,
    done: session.imposterTaskProgress.includes(index),
  }));
```

Replace the existing `objectives: clone(...)` and `imposterObjectives: clone(...)` lines in the snapshot return with the computed arrays.

- [ ] **Step 10.5: Type-check**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx tsc --noEmit`
Expected: Errors should be limited to the consumer code in SandboxPanel and use-sandbox (handled in Tasks 11-12).

- [ ] **Step 10.6: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add frontend/src/lib/mock-api.ts
git commit -m "$(cat <<'EOF'
feat(mock-api): mirror imposter validation flow

Mock executeSandbox now branches on role and returns the discriminated
union shape. Imposter task progress is tracked per session and reaching
zero charges triggers a mock imposter win.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: SandboxPanel + use-sandbox update (TDD)

**Files:**
- Modify: `frontend/src/__tests__/hooks/use-sandbox.test.ts`
- Modify: `frontend/src/hooks/use-sandbox.ts`
- Modify: `frontend/src/__tests__/panels/SandboxPanel.test.tsx`
- Modify: `frontend/src/components/game/panels/SandboxPanel.tsx`

- [ ] **Step 11.1: Update use-sandbox tests for discriminated union**

Replace the existing test mock responses in `frontend/src/__tests__/hooks/use-sandbox.test.ts` to include `mode: "civilian" as const`. Replace the `mockResponse` in the "sets loading…" test:

```ts
    const mockResponse = {
      mode: "civilian" as const,
      passed: 2,
      total: 3,
      results: [
        { passed: true, input: "1", expected: "1", actual: "1" },
        { passed: true, input: "2", expected: "2", actual: "2" },
        { passed: false, input: "3", expected: "3", actual: "4", error: "mismatch" },
      ],
    };
```

In the "passes stdin" test:
```ts
    mockExecute.mockResolvedValue({ mode: "civilian" as const, passed: 0, total: 0, results: [] });
```

In the "resets results" test:
```ts
    mockExecute.mockResolvedValue({ mode: "civilian" as const, passed: 1, total: 1, results: [] });
```

Add a new test at the end of the `describe` block:

```ts
  it("stores imposter validation response when mode is imposter", async () => {
    const mockResponse = {
      mode: "imposter" as const,
      completed: 1,
      total: 5,
      charges: 4,
      tasks: [
        { index: 0, title: "Reverse increment direction", lineHint: 7, done: true },
        { index: 1, title: "Komentari history append", lineHint: 8, done: false, hint: "Tambahkan #" },
      ],
    };
    mockExecute.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSandbox("session-1", "player-1"));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.results).toEqual(mockResponse);
  });
```

- [ ] **Step 11.2: Run use-sandbox tests, expect them to pass already**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx vitest run src/__tests__/hooks/use-sandbox.test.ts`
Expected: All tests pass — the hook is generic over the response shape, no code change needed in `use-sandbox.ts`. The hook only stores `results` in state; the discriminated union just makes the type more precise.

If TypeScript compile errors appear in `use-sandbox.ts`, the only fix is to ensure the import `import type { SandboxRunResponse } from "@/types";` is present and used as the state type — which is already the case.

- [ ] **Step 11.3: Update SandboxPanel tests — drop sabotage button assertion, add imposter render test**

In `frontend/src/__tests__/panels/SandboxPanel.test.tsx`:

1. Update `mockExecute.mockResolvedValue` calls to include `mode: "civilian" as const`. Two such calls — the "calls executeSandbox on RUN CODE" test and the "clears results on Clear" test.

2. **Delete** the `it("shows SABOTAGE button for imposters", …)` test (the imposter SABOTAGE button is removed).

3. **Add** new tests at the end:

```ts
  it("does not render SABOTAGE button for imposters", () => {
    render(<SandboxPanel {...baseProps} isCivilian={false} />);
    expect(screen.queryByText(/SABOTAGE/i)).not.toBeInTheDocument();
  });

  it("renders imposter task results when mode is imposter", async () => {
    mockExecute.mockResolvedValue({
      mode: "imposter" as const,
      completed: 1,
      total: 2,
      charges: 4,
      tasks: [
        { index: 0, title: "Reverse increment direction", lineHint: 7, done: true },
        { index: 1, title: "Komentari history append", lineHint: 8, done: false, hint: "Tambahkan # di line 8" },
      ],
    });

    render(<SandboxPanel {...baseProps} isCivilian={false} />);
    fireEvent.click(screen.getByText(/RUN CODE/));

    await waitFor(() => {
      expect(screen.getByText("1/2 VALIDATED")).toBeInTheDocument();
    });

    expect(screen.getByText("Reverse increment direction")).toBeInTheDocument();
    expect(screen.getByText("Komentari history append")).toBeInTheDocument();
    expect(screen.getByText(/Tambahkan # di line 8/)).toBeInTheDocument();
    expect(screen.getByText(/Line 8/)).toBeInTheDocument();
  });
```

- [ ] **Step 11.4: Run SandboxPanel tests, confirm failures**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx vitest run src/__tests__/panels/SandboxPanel.test.tsx`
Expected: New imposter test fails (SandboxPanel doesn't render imposter results yet). Existing "calls executeSandbox" test may also fail until panel handles discriminated union.

- [ ] **Step 11.5: Implement the SandboxPanel changes**

Replace `frontend/src/components/game/panels/SandboxPanel.tsx` with:

```tsx
"use client";

import { useSandbox } from "@/hooks/use-sandbox";
import type { GameSnapshot, SandboxRunResponse } from "@/types";
import { Play, TriangleAlert } from "lucide-react";

type SandboxPanelProps = {
  sessionId: string;
  playerId: string;
  phase: GameSnapshot["phase"];
  description: string;
  isCivilian: boolean;
  sabotageCharges: number;
  onPrimaryAction: () => void;
};

function isImposterResponse(
  response: SandboxRunResponse,
): response is Extract<SandboxRunResponse, { mode: "imposter" }> {
  return response.mode === "imposter";
}

export function SandboxPanel({
  sessionId,
  playerId,
  phase,
  description,
  isCivilian,
  sabotageCharges,
  onPrimaryAction,
}: SandboxPanelProps) {
  const { results, loading, error, execute, reset } = useSandbox(sessionId, playerId);

  const actionDisabled = phase !== "playing";

  return (
    <div className="border-t-4 border-[color:var(--brown)]">
      <div className="flex items-center justify-between bg-[#f7edd8] p-3 gap-2">
        <div className="pixel-small text-[#5c4427] flex-1 min-w-0">{description}</div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void execute()}
            disabled={actionDisabled || loading}
            className={`pixel-button pixel-button-success text-xs px-3 ${
              actionDisabled || loading ? "opacity-60" : ""
            }`}
          >
            {loading ? "Running..." : (
              <span className="flex items-center gap-2">
                <Play className="w-4 h-4 fill-current" />
                {isCivilian ? "RUN CODE" : "VALIDATE BUG"}
              </span>
            )}
          </button>
          {isCivilian ? (
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={actionDisabled}
              className={`pixel-button pixel-button-emergency shrink-0 ${
                actionDisabled ? "opacity-60" : "animate-emergency-pulse"
              }`}
            >
              <span className="flex items-center gap-2">
                <TriangleAlert className="w-4 h-4 fill-current" />
                EMERGENCY
              </span>
            </button>
          ) : (
            <span className="pixel-small text-[#5c4427] shrink-0">
              {sabotageCharges} charges left
            </span>
          )}
        </div>
      </div>

      {error ? (
        <div className="bg-[var(--status-error-bg)] border-t-3 border-[var(--status-error-border)] px-4 py-3 flex items-center justify-between">
          <span className="pixel-small text-[#5c0a0a]">{error}</span>
          <button
            type="button"
            onClick={() => void execute()}
            className="pixel-button text-xs px-3 min-h-[32px]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading && !results ? (
        <div className="bg-[#fff8ea] border-t-3 border-[var(--brown)] px-4 py-3">
          <div className="pixel-progress pixel-progress-indeterminate">
            <div className="pixel-progress-bar" />
          </div>
          <p className="pixel-small text-[#5c4427] mt-2">
            {isCivilian ? "Executing tests..." : "Validating sabotage..."}
          </p>
        </div>
      ) : null}

      {results && isImposterResponse(results) ? (
        <div className="bg-[#fff8ea] border-t-3 border-[var(--brown)] px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span
              className={`pixel-badge ${
                results.completed === results.total ? "pixel-badge-success" : "pixel-badge-danger"
              }`}
            >
              {results.completed}/{results.total} VALIDATED
            </span>
            <button
              type="button"
              onClick={reset}
              className="pixel-small text-[#5c4427] underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {results.tasks.map((task) => (
              <div
                key={task.index}
                className={`pixel-panel-result px-3 py-2 ${
                  task.done
                    ? "border-l-4 border-l-[var(--status-success-border)]"
                    : "border-l-4 border-l-[var(--status-error-border)]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`pixel-badge ${task.done ? "pixel-badge-success" : "pixel-badge-danger"}`}>
                    {task.done ? "PASS" : "FAIL"}
                  </span>
                  <span className="pixel-small text-[#5c4427]">{task.title}</span>
                </div>
                <p className="pixel-small text-[#5c4427]">Line {task.lineHint}</p>
                {task.hint ? (
                  <p className="pixel-small text-[#9f2c27] mt-1">{task.hint}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {results && !isImposterResponse(results) ? (
        <div className="bg-[#fff8ea] border-t-3 border-[var(--brown)] px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span
              className={`pixel-badge ${
                results.passed === results.total ? "pixel-badge-success" : "pixel-badge-danger"
              }`}
            >
              {results.passed}/{results.total} PASSED
            </span>
            <button
              type="button"
              onClick={reset}
              className="pixel-small text-[#5c4427] underline cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2">
            {results.results.map((test, idx) => (
              <div
                key={idx}
                className={`pixel-panel-result px-3 py-2 ${
                  test.passed
                    ? "border-l-4 border-l-[var(--status-success-border)]"
                    : "border-l-4 border-l-[var(--status-error-border)]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`pixel-badge ${test.passed ? "pixel-badge-success" : "pixel-badge-danger"}`}>
                    {test.passed ? "PASS" : "FAIL"}
                  </span>
                  <span className="pixel-small text-[#5c4427]">Test {idx + 1}</span>
                </div>
                {test.input ? (
                  <p className="pixel-small text-[#5c4427]">
                    Input: <code className="bg-[#e8dcc8] px-1">{test.input}</code>
                  </p>
                ) : null}
                <p className="pixel-small text-[#5c4427]">
                  Expected: <code className="bg-[#e8dcc8] px-1">{test.expected}</code>
                </p>
                <p className="pixel-small text-[#5c4427]">
                  Got: <code className="bg-[#e8dcc8] px-1">{test.actual}</code>
                </p>
                {test.error ? (
                  <p className="pixel-small text-[#9f2c27] mt-1">{test.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 11.6: Run all SandboxPanel + use-sandbox tests, expect pass**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx vitest run src/__tests__/panels/SandboxPanel.test.tsx src/__tests__/hooks/use-sandbox.test.ts`
Expected: All pass.

If a test that searches for `"▶ RUN CODE"` (with the unicode play prefix) fails, update the test query. The new label text has no `▶` prefix; the icon is the lucide `Play` component now. Tests should query by `/RUN CODE/` regex.

The existing test `it("renders description and action buttons", …)` in SandboxPanel.test.tsx queries by `screen.getByText("▶ RUN CODE")` and `screen.getByText("△ EMERGENCY")`. Update both:

```ts
  it("renders description and action buttons", () => {
    render(<SandboxPanel {...baseProps} />);
    expect(screen.getByText("Fix the bug in the code.")).toBeInTheDocument();
    expect(screen.getByText("RUN CODE")).toBeInTheDocument();
    expect(screen.getByText("EMERGENCY")).toBeInTheDocument();
  });
```

Similarly update the `screen.getByText("▶ RUN CODE")` in the disable test to `screen.getByText("RUN CODE")` (using `getByText` will find the inner text inside the button since the button wraps a span containing "RUN CODE"). The disabled assertion needs the button itself; use `screen.getByRole("button", { name: /RUN CODE/ })`:

```ts
  it("disables buttons when phase is not playing", () => {
    render(<SandboxPanel {...baseProps} phase="meeting" />);
    expect(screen.getByRole("button", { name: /RUN CODE/ })).toBeDisabled();
  });
```

And the EMERGENCY button click test:

```ts
  it("calls onPrimaryAction when emergency button clicked", () => {
    render(<SandboxPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /EMERGENCY/ }));
    expect(baseProps.onPrimaryAction).toHaveBeenCalledTimes(1);
  });
```

Re-run tests until green.

- [ ] **Step 11.7: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add frontend/src/components/game/panels/SandboxPanel.tsx frontend/src/__tests__/panels/SandboxPanel.test.tsx frontend/src/__tests__/hooks/use-sandbox.test.ts
git commit -m "$(cat <<'EOF'
feat(panel): branch sandbox results render on imposter vs civilian

Imposter sees per-task PASS/FAIL with line hints and inline guidance.
The SABOTAGE button is gone; charges-left is now an inline label.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: GameSessionClient — sidebar count + drop sabotage primary action

**Files:**
- Modify: `frontend/src/components/game/GameSessionClient.tsx`

- [ ] **Step 12.1: Update sidebar count and primary action**

In `frontend/src/components/game/GameSessionClient.tsx`, find the lines that compute `sideTitle` and `sideCount` (around line 204):

```tsx
  const isCivilian = snapshot.currentUser.role === "civilian";
  const roleLabel = isCivilian ? "CIVILIAN" : "IMPOSTER";
  const sideTitle = isCivilian ? "Test Cases" : "Sabotage Tasks";
  const sideCount = isCivilian ? `(${snapshot.objectives.filter(o => o.done).length}/${snapshot.objectives.length})` : `(${snapshot.sabotageCharges}/5)`;
```

Replace the `sideCount` line so imposter also reports completed/total tasks:

```tsx
  const sideCount = isCivilian
    ? `(${snapshot.objectives.filter(o => o.done).length}/${snapshot.objectives.length})`
    : `(${snapshot.imposterObjectives.filter(o => o.done).length}/${snapshot.imposterObjectives.length})`;
```

- [ ] **Step 12.2: Update the sub-line text under the task list**

Find (around line 321):

```tsx
                <p className="pixel-small mt-4 text-white/60">
                  {isCivilian
                    ? "Call emergency meeting if you see something sus."
                    : `${snapshot.sabotageCharges} charges left. Use wisely.`}
                </p>
```

Update the imposter copy to point at RUN CODE:

```tsx
                <p className="pixel-small mt-4 text-white/60">
                  {isCivilian
                    ? "Call emergency meeting if you see something sus."
                    : `${snapshot.sabotageCharges} charges left. Edit the code and click VALIDATE BUG.`}
                </p>
```

- [ ] **Step 12.3: Drop the sabotage branch from handlePrimaryAction**

Find `handlePrimaryAction` (around line 225):

```tsx
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
```

Replace with:

```tsx
  function handlePrimaryAction() {
    if (isCivilian) {
      sendRealtimeMessage({ type: "meeting.start" });
    }
    // Imposter has no primary action; sabotage flows through RUN CODE in SandboxPanel.
  }
```

- [ ] **Step 12.4: Type-check**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 12.5: Commit**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add frontend/src/components/game/GameSessionClient.tsx
git commit -m "$(cat <<'EOF'
feat(game): sidebar shows imposter task progress; remove sabotage WS path

Imposter sidebar now reports (X/5) sabotage tasks completed instead of
charges. The primary-action button no longer triggers a WS sabotage.use;
that action is gone from the data model.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Full frontend test sweep

**Files:**
- Run only

- [ ] **Step 13.1: Run all frontend tests**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx vitest run`
Expected: All tests pass.

If anything fails, fix it inline. Common likely failures:
- `mock-api` snapshot tests (none exist currently, so unlikely)
- `SecurityPanel` or `AiAssistPanel` tests are independent — should not be impacted
- Type errors surfacing during test compile

- [ ] **Step 13.2: Run lint**

Run: `cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx eslint .`
Expected: Clean. Fix any reported issues (typically unused imports — easy fixes).

- [ ] **Step 13.3: Build check (frontend + backend)**

Run in parallel (two shells):
```bash
cd /Users/ztrenggono/developer/competitionProject/amongus/frontend && npx next build
```
```bash
cd /Users/ztrenggono/developer/competitionProject/amongus/backend && npm run build
```
Expected: Both succeed.

- [ ] **Step 13.4: Commit any final fixes (if needed)**

If any inline fixes were made during this task:
```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git add -A
git commit -m "$(cat <<'EOF'
chore: post-implementation cleanup for sabotage redesign

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: End-to-end smoke test

**Files:**
- Run only

- [ ] **Step 14.1: Reset Postgres + reseed**

If running locally with a docker-compose db, drop and recreate the `sessions` table to pick up the new column without migration headaches:

```bash
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS sessions CASCADE;"
```

Then start the backend (`npm run dev` in `backend/`) — `initDatabase()` will recreate `sessions` with the new column and reseed challenges with the new imposter task arrays.

If the user runs in `MOCK_MODE`, no DB reset is needed.

- [ ] **Step 14.2: Manual smoke — civilian path**

1. Start frontend: `cd frontend && npm run dev`
2. Open browser, create a lobby with 4 players (or use mock mode).
3. As a civilian: open RUN CODE, verify test cards still render with `(X/Y) PASSED` chip.
4. Verify the sidebar `Test Cases (X/3)` updates as tests pass.

- [ ] **Step 14.3: Manual smoke — imposter path**

1. Get assigned imposter role.
2. Verify sidebar shows `Sabotage Tasks (0/5)` and 5 task cards listing concrete instructions (e.g. "Reverse increment direction").
3. Edit the editor to apply the FIRST task's mutation (e.g. change `self.count += 1` to `self.count -= 1`).
4. Click `VALIDATE BUG`.
5. Verify:
   - Result panel shows `1/5 VALIDATED`.
   - Task 1 card shows `PASS` (green left border).
   - Other 4 task cards show `FAIL` with their hints.
   - Sidebar count updates to `(1/5)`.
   - "X charges left" decrements to 4.
6. Apply remaining 4 mutations one at a time, validating each.
7. After 5th validation, verify `GAME OVER — IMPOSTER WINS` overlay appears.

- [ ] **Step 14.4: Verify SABOTAGE button is gone**

Confirm the imposter UI shows `VALIDATE BUG` (not `RUN CODE`) and there is no `SABOTAGE` button anywhere.

- [ ] **Step 14.5: Final commit if any tweaks**

```bash
cd /Users/ztrenggono/developer/competitionProject/amongus
git status
# If clean, no commit needed.
```

---

## Self-review notes (for the implementer's awareness)

- **Spec coverage:** All five spec sections (data shape, backend, snapshot, frontend, migration) have at least one task touching them. Task 1+2-5 cover data shape + seed; Task 6-9 cover backend; Task 8 covers snapshot done flags; Tasks 10-12 cover frontend; Task 1 + 14 cover migration.
- **Type names:** Verified consistency — `ImposterTaskDef` (backend service + seed), `ImposterTaskResult` (route response item), `ImposterValidationResponse` (top-level frontend type), `CivilianRunResponse` (top-level frontend type), `SandboxRunResponse` (the union).
- **Charges semantics:** Only newly-completed tasks decrement charges. `executeMockSandbox` and the backend route both compute `nextCharges = sabotage_charges - newlyCompleted.length` (clamped at 0). The next snapshot publishes the new charge count.
- **Test runs query in Task 8:** Uses `playerId ?? ""` — when no playerId is in the request, the query returns no rows and all `done` flags become `false`, which is correct (no civilian context, no per-test progress to attribute).
