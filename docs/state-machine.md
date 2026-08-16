# Engineering Workflow State Machine

This document turns the canonical workflow in `docs/workflow.md` into a concrete implementation model for the OpenCode harness.

The goal is not to create a heavyweight workflow engine. The goal is to make the harness behave like a small, explicit state machine whose transitions are constrained by agent roles, permissions, worktree state, and verification results.

## 1. Core model

A feature request is a stateful execution record. At minimum, the harness should be able to determine:

- current workflow state;
- objective and acceptance criteria;
- active task DAG and task dependencies;
- worktree assigned to each implementation task;
- implementation/review/verification results;
- outstanding judgment gates;
- artifacts produced by each specialist;
- whether the current transition is legal.

Conceptually:

```text
State + Event + Preconditions -> State + Actions + Artifacts
```

The state machine should be deterministic about **what is allowed next**, while agents remain responsible for the substantive engineering judgments inside each state.

## 2. Canonical states

| State | Owner | Purpose | Allowed work | Exit condition |
|---|---|---|---|---|
| `UNDERSTAND` | lead | Establish objective and acceptance criteria | Clarify ambiguity; define success | Objective is sufficiently concrete |
| `INSPECT` | lead / explore | Understand repository and current state | Read-only inspection; git state/history | Relevant architecture and constraints known |
| `PLAN` | planner | Produce implementation plan | Decompose work, dependencies, risks, verification strategy | Plan and task DAG exist |
| `DELEGATE` | lead | Assign bounded work | Create tasks/worktrees; launch specialists | All executable tasks have owners |
| `IMPLEMENT` | coder | Modify source in isolated worktree | Code, tests, lint, typecheck, routine commits | Task implementation complete or explicitly failed |
| `MERGE` | lead | Integrate completed worktrees | Apply/merge worktree changes; resolve conflicts | All required task outputs integrated |
| `VERIFY` | lead / coder | Establish objective correctness | Tests, lint, typecheck, build, targeted checks | Verification passes |
| `REVIEW` | reviewer | Independently evaluate artifact | Read diff/context; run verification; identify findings | Verdict is `APPROVE` or `NEEDS_FIXES` |
| `FIX` | coder | Address review findings | Modify implementation in appropriate worktree | Findings addressed and verification rerun |
| `DOCUMENT` | coder / lead | Update relevant documentation | Docs, changelog, implementation notes | Required documentation complete |
| `COMMIT` | lead | Record completed work | Routine git commit | Commit exists |
| `REPORT` | lead | Return result to user | Done/Verified/Decisions/Needs you | Final report emitted |

`RESEARCH` is a supporting state rather than a mandatory stage. The lead may enter it from `INSPECT` or `PLAN` when external information is required, then return to the state that requested the research.

## 3. Legal transitions

The default transition graph is:

```text
UNDERSTAND
    |
    v
INSPECT <-------- RESEARCH
    |
    v
  PLAN
    |
    v
DELEGATE
    |
    v
IMPLEMENT --+ 
    |        |
    +--------+  (parallel tasks)
    |
    v
 MERGE
    |
    v
 VERIFY ---- failure ----> IMPLEMENT
    |
    | pass
    v
 REVIEW
   /   \
  /     \
APPROVE  NEEDS_FIXES
  |          |
  v          v
DOCUMENT    FIX
  |          |
  |          v
  |        VERIFY
  |          |
  |__________+----> REVIEW
  |
  v
COMMIT
  |
  v
REPORT
```

The important property is that **state transitions are explicit**. A prompt saying “review the code” is not equivalent to a valid `REVIEW` transition. The harness should know that review follows verification and that `NEEDS_FIXES` cannot bypass `FIX` and `VERIFY`.

## 4. State invariants

These invariants should eventually be represented as validation rules and, where the harness can enforce them, hard permission/tool gates.

### Planning

- `PLAN` cannot modify production source files.
- The plan must identify affected components, dependencies, risks, verification, and independent tasks.
- Every executable task has a unique task ID.
- Every dependency refers to an existing task.
- The dependency graph must be acyclic.

### Delegation

- `lead` is the only agent allowed to delegate.
- Every implementation task has exactly one implementation owner.
- Independent implementation tasks receive isolated worktrees.
- A task cannot start until its dependency states permit it.

### Implementation

- `coder` is the normal source-modification authority.
- A coder works only in its assigned worktree.
- Routine commits are permitted; push is not.
- Destructive repository operations remain gated.

### Merge

- A worktree cannot be treated as complete merely because a coder reports success.
- The worktree's actual git state must be inspected.
- Conflicts produce an explicit conflict state/result; they are never silently overwritten.
- All required task outputs must be integrated before global verification.

### Verification

- `VERIFY` must execute objective checks appropriate to the repository.
- A failed verification cannot transition to `REVIEW` or `REPORT`.
- Verification results belong to the current implementation revision.
- After a code change, previous verification results are stale.

### Review

- Reviewer receives objective, constraints, relevant context, and resulting diff.
- Reviewer does not receive the coder's justification as a prerequisite to forming the initial verdict.
- Reviewer must return exactly one primary verdict: `APPROVE` or `NEEDS_FIXES`.
- `NEEDS_FIXES` cannot transition directly to `COMMIT`, `DOCUMENT`, or `REPORT`.

### Fix loop

```text
REVIEW(NEEDS_FIXES)
        |
        v
      FIX
        |
        v
     VERIFY
        |
        v
     REVIEW
```

Every fix invalidates verification for the changed artifact. This prevents a reviewer from approving code that was never re-verified after the fixes.

### Completion

- `COMMIT` requires successful verification and an `APPROVE` verdict.
- `REPORT` requires a commit unless the task explicitly ended before commit because a user judgment gate was reached.
- `git push` is never an automatic state transition.
- User approval gates terminate autonomous execution until the user explicitly authorizes the action.

## 5. How this fits OpenCode

The state machine does not need to replace OpenCode's agent system. It should sit **above** the agents and constrain how the existing components are used.

### `lead`

`lead` is the state-machine coordinator.

It should maintain the current workflow state in its working context and treat each subagent result as an event that either permits or blocks a transition.

Examples:

```text
planner result        -> PLAN complete -> DELEGATE
coder result          -> IMPLEMENT complete -> MERGE
merge result          -> MERGE complete -> VERIFY
verification pass     -> VERIFY complete -> REVIEW
verification failure  -> IMPLEMENT / FIX
review APPROVE        -> DOCUMENT
review NEEDS_FIXES    -> FIX
coder fixes complete  -> VERIFY
commit complete       -> REPORT
```

The critical design change is that the lead should not decide transitions solely from natural-language reports. It should reconcile reports against observable repository state whenever possible.

### `planner`

The planner produces a machine-readable planning artifact in addition to prose.

Conceptual shape:

```yaml
objective: Add OAuth login
acceptance_criteria:
  - users can authenticate with provider X
  - existing sessions remain valid

tasks:
  - id: auth-api
    owner: coder
    depends_on: []
    worktree: required
  - id: auth-ui
    owner: coder
    depends_on: []
    worktree: required
  - id: integration-tests
    owner: coder
    depends_on: [auth-api, auth-ui]
    worktree: required

verification:
  - npm test
  - npm run typecheck
risks:
  - session migration
```

The exact serialization can evolve; the important property is that task identity and dependencies stop being implicit prose.

### `coder`

A coder receives a bounded task plus its dependency outputs. It should not be responsible for deciding the global workflow state.

Its completion report should identify:

- task ID;
- worktree;
- files changed;
- tests/checks run;
- commit SHA;
- deviations;
- unresolved problems.

### `reviewer`

The reviewer is a state-machine gate, not another implementation agent.

The harness should construct its review input from authoritative artifacts:

```text
objective
+ constraints
+ accepted plan
+ final integrated diff
+ repository context
+ verification results
```

The review result should be normalized to:

```yaml
verdict: APPROVE | NEEDS_FIXES
critical_findings: []
should_fix: []
nits: []
verification_performed: []
recommendation: ...
```

## 6. Task DAG execution

Parallelism should be derived from the dependency graph rather than from an agent's ad hoc decision to launch several tasks.

Example:

```text
             ┌──────────────┐
             │   Task A     │
             │   API        │
             └──────┬───────┘
                    │
                    ├──────────────┐
                    │              │
                    v              v
             ┌──────────────┐  ┌──────────────┐
             │   Task C     │  │   Task D     │
             │ integration  │  │ documentation│
             └──────────────┘  └──────────────┘

             ┌──────────────┐
             │   Task B     │
             │   UI         │
             └──────┬───────┘
                    │
                    └──────► Task C
```

A scheduler can classify tasks as:

```text
READY       = all dependencies are COMPLETE
BLOCKED     = one or more dependencies incomplete
RUNNING     = assigned to a coder
COMPLETE    = implementation + local verification complete
FAILED      = cannot proceed without intervention
```

Only `READY` tasks may enter `IMPLEMENT`.

For independent tasks:

```text
A READY ──► WT-A ──► CODER-A ──► COMPLETE ──┐
                                             ├──► MERGE ──► VERIFY
B READY ──► WT-B ──► CODER-B ──► COMPLETE ──┘
```

For dependent tasks:

```text
A READY ──► WT-A ──► COMPLETE
                       |
                       v
                 B becomes READY
                       |
                       v
                    WT-B
```

This gives the harness a concrete answer to “what can run now?” without relying on prompt wording.

## 7. Worktree state is part of workflow state

A task should carry an explicit worktree record:

```yaml
task_id: auth-api
worktree: /path/to/wt-auth-api
branch: agent/task-auth-api
status: COMPLETE
commit: abc1234
```

The worktree lifecycle should be:

```text
CREATE
  -> ASSIGNED
  -> CODING
  -> VERIFIED_LOCAL
  -> READY_TO_MERGE
  -> MERGED
  -> CLEANED
```

Abandoned work should instead become:

```text
CODING -> ABANDONED -> GC_PENDING -> CLEANED
```

This makes worktree cleanup an explicit lifecycle operation rather than incidental housekeeping.

## 8. Verification as a gate, not a report

The distinction is important:

```text
BAD:
  coder says “tests pass”
       -> reviewer

GOOD:
  coder reports tests pass
       -> harness executes/observes verification
       -> verification artifact recorded
       -> reviewer
```

The harness should associate verification with a revision/commit where practical:

```yaml
verification:
  revision: abc1234
  status: PASS
  checks:
    - command: npm test
      status: PASS
    - command: npm run typecheck
      status: PASS
```

If the commit changes, the verification record becomes stale and must be regenerated.

## 9. Human approval gates

Human approval should not be represented as a vague “ask the user when appropriate” instruction.

Instead, the harness should classify actions into two categories.

### Hard permission gates

Mechanically block or ask before:

- `git push`;
- force push;
- destructive git operations;
- destructive filesystem operations;
- production deployment;
- publishing packages;
- irreversible external operations.

### Judgment gates

The lead must stop before proceeding with:

- major architecture changes;
- security/auth architecture changes;
- production migrations;
- substantial scope changes;
- consequential dependency/infrastructure choices.

Hard gates belong in permissions. Judgment gates belong in the workflow state and lead contract.

## 10. Practical implementation path

The state machine should be introduced incrementally rather than as one large rewrite.

### Phase A — Define the contract

1. Keep `docs/workflow.md` as the canonical visual model.
2. Add this document as the implementation specification.
3. Define stable state names and transition rules.
4. Define the task/DAG and report schemas.

### Phase B — Make reports machine-readable

1. Require planner output to contain task IDs and dependencies.
2. Require coder output to contain task ID, worktree, commit, and verification.
3. Require reviewer output to contain a normalized verdict.
4. Require the lead to preserve these artifacts during the run.

### Phase C — Add a lightweight workflow record

Start with a single JSON/JSONC state record rather than building a database.

Conceptually:

```json
{
  "state": "REVIEW",
  "objective": "...",
  "tasks": {
    "auth-api": { "status": "COMPLETE", "worktree": "..." },
    "auth-ui": { "status": "COMPLETE", "worktree": "..." }
  },
  "verification": { "status": "PASS", "revision": "..." },
  "review": { "verdict": "APPROVE" }
}
```

The implementation can later move this into plugin-managed state if needed.

### Phase D — Enforce transitions

Add a small transition validator:

```text
can_transition(current, event, state) -> allowed | reason
```

Examples:

```text
PLAN -> DELEGATE
  allowed only when DAG is valid

MERGE -> VERIFY
  allowed only when required tasks are integrated

VERIFY -> REVIEW
  allowed only when verification = PASS

REVIEW(NEEDS_FIXES) -> COMMIT
  ALWAYS DENIED

REVIEW(NEEDS_FIXES) -> FIX
  allowed

FIX -> VERIFY
  allowed only after coder reports a new revision

REVIEW(APPROVE) -> DOCUMENT
  allowed

DOCUMENT -> COMMIT
  allowed only when required docs are complete
```

The validator does not need to understand the codebase. It only needs to enforce workflow invariants.

### Phase E — Add regression scenarios

Validation should deliberately attempt illegal transitions:

- planner tries to edit source;
- lead attempts direct feature implementation;
- coder attempts push;
- review is skipped;
- failed verification is reported as complete;
- `NEEDS_FIXES` attempts to reach commit;
- dependent task starts before its dependency completes;
- worktree is deleted before its changes are integrated;
- verification from an old revision is reused after a code change.

A successful harness is one that refuses these paths, not merely one that follows the desired path when prompted correctly.

## 11. The resulting architecture

The target architecture is therefore:

```text
USER
  |
  | objective / constraints
  v
LEAD
  |
  +--> UNDERSTAND
  +--> INSPECT ----> RESEARCH (when needed)
  +--> PLAN --------> Task DAG
  |                    |
  |                    +--> READY tasks --> isolated worktrees
  |                                      |
  |                                      v
  |                                   CODER(s)
  |                                      |
  |                                 local verify
  |                                      |
  +--------------------------------------+
  |
  v
MERGE
  |
  v
VERIFY ======= failure ======> CODER/FIX
  |
  | pass
  v
REVIEW ===== NEEDS_FIXES =====> FIX -> VERIFY -> REVIEW
  |
  | APPROVE
  v
DOCUMENT
  |
  v
COMMIT
  |
  v
REPORT
  |
  v
USER
```

The key architectural principle is that **the agents perform work, but the state machine determines whether that work constitutes a legal progression of the engineering process**.

That is the mechanism for moving the harness from “a collection of good prompts and permissions” toward a deterministic engineering system.
