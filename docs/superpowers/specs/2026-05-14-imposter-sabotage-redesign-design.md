# Imposter Sabotage Workflow Redesign

**Date:** 2026-05-14
**Status:** Draft (pending user review)

## Problem

The current sabotage system has three pain points reported in-game:

1. **Imposter tasks are generic.** `imposterObjectives` in [seed-data.ts](../../../backend/src/seed-data.ts) read like flavor text ("Spend sabotage charges carefully", "Poison at least one AI hint") rather than actionable instructions tied to specific lines of code.
2. **Sidebar count is misleading.** The header shows `(5/5)` for imposter, but only 3 task cards render. The `(5/5)` is `sabotageCharges/5` ([GameSessionClient.tsx:205](../../../frontend/src/components/game/GameSessionClient.tsx)) — players read it as "5 of 5 tasks" and expect 5 placeholders.
3. **Sabotage flow is one-click magic.** The `SABOTAGE` button auto-applies a random mutation server-side ([index.ts:1346–1404](../../../backend/src/index.ts)). The imposter never engages with the editor; the planted bug is opaque to them and to civilians.

Civilians also have no per-task feedback: their objectives never turn green even when individual tests pass.

## Goal

Turn sabotage into a deliberate edit-then-validate loop:

- Imposter receives **5 concrete sabotage tasks per challenge**, each pointing to a specific line and operator change.
- Imposter manually edits the code in the editor, clicks **RUN CODE**, and the backend validates whether the planted bug matches the active task.
- Civilian RUN CODE keeps current behavior but additionally turns its 3 task cards green as individual tests pass (1 test ↔ 1 task).
- Sabotage charges are consumed implicitly when a task validates, not by a separate button.

## Non-Goals

- No changes to category voting, meeting, scoring, or AI assist panels.
- No new game modes — this applies to the existing standard/classic mode only.
- No new challenges added; existing 12 challenges get richer task data.

---

## Architecture

### Data shape (per challenge)

`seed-data.ts` `imposterObjectives` becomes an array of exactly 5 entries with the **hybrid validation** shape:

```ts
type ImposterTaskDef = {
  title: string;             // "Balik arah operator increment"
  description: string;       // shown in sidebar card
  lineHint: number;          // line number for the hint message
  expectedPattern: string;   // regex; must match editor_content after edit
  forbiddenPattern?: string; // regex; original line that must no longer match
  hint: string;              // shown in RUN CODE result when task is FAIL
};
```

- `expectedPattern` and `forbiddenPattern` are JS-style regex source strings, compiled with `new RegExp(pattern, "m")` server-side.
- `lineHint` is informational only — used to render `Line 9: <hint>` in the result panel. Validation does not depend on line counts (so player adding/removing lines doesn't break detection).
- A task is validated **done** iff `expectedPattern` matches **and** `forbiddenPattern` (if defined) does not match.

Civilian `objectives` keeps its existing 3-item shape but is now expected to align 1:1 with `tests`. The `done` flag is computed from the latest test run.

### Backend

**DB schema (`backend/src/db.ts`):**
Add column to `sessions`:
```sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS imposter_task_progress JSONB NOT NULL DEFAULT '[]'::jsonb;
```
Stores an array of completed task indexes, e.g. `[0, 2, 4]`.

**Sandbox route (`backend/src/routes/sandbox-routes.ts`):**
The single `/api/sessions/:sessionId/execute` endpoint branches on the caller's role (looked up via `loadSessionRole`):

- **Civilian** path: unchanged. Returns existing `SandboxRunResponse`.
- **Imposter** path: new `runImposterValidation()` in a new module `backend/src/services/sabotage-validator.ts`:
  1. Load `imposterObjectives` from challenge, current `editor_content`, and `imposter_task_progress` from session.
  2. For each task index `i`:
     - If already in `imposter_task_progress`, mark `done: true` and skip detection.
     - Else evaluate `expectedPattern` and `forbiddenPattern` against `editor_content`. Set `done` and capture `hint` if not done.
  3. Atomically (in one UPDATE): append newly-validated indexes to `imposter_task_progress`, decrement `sabotage_charges` by the number of newly completed tasks.
  4. If `sabotage_charges` reaches `0` (all 5 tasks done), call `finishGame(sessionId, "imposter", …)` reusing existing helper.
  5. Insert a row into `session_sabotage_log` per newly-validated task (replaces the existing single insert from `sabotage.use`).
  6. Append a system + imposter chat message ("Sabotage validated: <task title>").
- Response envelope (discriminated union by `mode`):
  ```ts
  type ImposterValidationResponse = {
    mode: "imposter";
    completed: number;          // total done
    total: number;              // 5
    tasks: Array<{
      title: string;
      lineHint: number;
      done: boolean;
      hint?: string;            // present when !done
    }>;
  };
  type CivilianRunResponse = SandboxRunResponse & { mode: "civilian" };
  ```

**Snapshot (`getSessionSnapshot` in `backend/src/index.ts`):**
- Civilian: read latest row from `session_test_runs` for this session+player; mark `objectives[i].done = results[i]?.passed === true`. If no run yet, all `false`.
- Imposter: `imposterObjectives[i].done = imposter_task_progress.includes(i)`.

**WebSocket (`backend/src/index.ts`):**
- Remove `sabotage.use` handler entirely. Sabotage is now an HTTP execute call.
- Remove `SABOTAGE_MUTATIONS` array and `applySabotage()` (no longer used).

### Frontend

**Types (`frontend/src/types/index.ts`):**
- Extend `GameObjective` with optional `lineHint?: number`.
- Add `ImposterValidationResponse` and turn the run-code response into a discriminated union.
- Remove `"sabotage.use"` from `SessionRealtimeMessage` ([api.ts](../../../frontend/src/lib/api.ts)).

**`GameSessionClient.tsx`:**
- Sidebar count for imposter: `(${imposterObjectives.filter(o => o.done).length}/5)`.
- Below the task list, render charges as a sub-line: `${sabotageCharges} charges left`.
- Remove the `handlePrimaryAction` sabotage branch. The `EMERGENCY` button stays for civilian only; the imposter loses its right-side action button (no replacement — RUN CODE does the work).

**`SandboxPanel.tsx`:**
- Remove the `onPrimaryAction` button rendering for imposter. Keep only RUN CODE for imposter.
- Branch result rendering on `results.mode`:
  - `civilian`: existing test card list.
  - `imposter`: list 5 task cards. Each card: PASS/FAIL chip, title, line hint, and the hint string when FAIL. Pass renders green (`pixel-badge-success`); fail renders red with hint body.

**`use-sandbox.ts`:**
- Update generic `results` state type to the discriminated union. No other behavior change — caller decides how to render.

### Charge / win-condition reconciliation

The existing rule is "imposter wins when `sabotage_charges` hits 0 by spending them" ([index.ts:1395–1402](../../../backend/src/index.ts)). New rule: charges decrement only when a task validates. So the imposter wins by completing all 5 sabotage tasks, which is a stronger version of the same trigger.

Civilian win path (eject the imposter via meeting) is untouched.

### Migration impact

| Area | Change | Migration cost |
|---|---|---|
| `sessions` table | Add `imposter_task_progress JSONB` | Idempotent `ADD COLUMN IF NOT EXISTS` in `initDatabase()` |
| `seed-data.ts` | Rewrite `imposterObjectives` for all 12 challenges | ~60 task entries, manual |
| Existing in-flight sessions | Old session rows have null progress → defaulted to `[]` | None; `DEFAULT` clause handles it |
| Frontend tests | `SandboxPanel.test.tsx`, `use-sandbox.test.ts` | Update mock response to discriminated union |

---

## Open questions resolved

1. **Sabotage button**: Removed entirely. Workflow becomes `edit → RUN CODE → validated`.
2. **Task count**: Exactly 5 imposter tasks per challenge (matches initial charges count).
3. **Civilian task mapping**: 1 test ↔ 1 task. Civilian challenges already have 3 tests for 3 objectives, so this is a clean fit.
4. **Validation strategy**: Hybrid — regex (`expectedPattern` + optional `forbiddenPattern`) for detection, `lineHint` is purely for human-readable hint rendering.
5. **Seed scope**: Write all 12 challenges fully in this change.

## Out of scope (potential follow-ups)

- Letting imposter "preview" their assigned tasks before round starts.
- Multi-line / AST-level sabotage validation.
- Custom imposter task generators per category.
