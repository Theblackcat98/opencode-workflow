# OpenCode Engineering-Harness Implementation Plan

> "I am the product architect. The harness is the engineering department."

This plan builds a thin engineering-operating layer on top of opencode, scoped
to this repository. It is the staging ground: everything here gets exercised,
validated, and hardened **before** being packaged into a self-contained
template that can be copied into any folder or workspace. There is **no**
promotion to the global config (`~/.config/opencode/`).

**Status:** Phases 0–4.5 implemented and validated (2026-08-15) — scaffold, git init,
constitution, agent team, commands, sandbox validation (scenarios 1–8), and the worktree
plugin fork + gap-fix round (scenarios 9–11) are all complete; see the per-phase status
notes below. **Phase 4.6 (delegation-first workflow & command integration) is planned,
not started** — addresses two observed weaknesses from real usage: the lead still does
too much work itself, and the commands are disconnected from the workflow. **Phase 5
(portability — copyable template, no global promotion) remains the final phase: planned,
not started.** Phase 6 (dynamic model routing) removed.
Constitution migrated to `.opencode/constitution.md` (injected via `instructions`;
AGENTS.md = workspace notes only) — 2026-08-15, see decision 8.

---

## 1. Purpose

Turn opencode from an AI-powered text editor into an engineering team that the
user can delegate feature-level objectives to:

- User says **what + why** (product vision, scope, constraints, priorities).
- Harness determines **how** (inspect, plan, implement, test, debug, review,
  document, commit) and closes the engineering loop itself.
- Approval gates protect only consequential operations (push to protected
  branches, destructive git, deploys, secrets, migrations, architecture).
- Models are interchangeable infrastructure, routed per task type.

## 2. Current state (audit)

| Component | Status |
|---|---|
| opencode version | 1.18.18 (Termux/Android) |
| `~/.config/opencode/opencode.jsonc` | Empty shell (`$schema` only) |
| Worktree plugin | **Exists** — global `worktree.ts` + `worktree/` + `kdco-primitives`, **forked & adapted 2026-08-15** (agent-centric, no terminal spawn); exposes `worktree_create` / `worktree_apply` / `worktree_delete` / `worktree_gc` / `worktree_resolve_conflicts`; still at the global path — moves into `.opencode/plugin/` in Phase 5 |
| Agents | None configured (built-ins only: `build`, `plan`, `general`, `explore`, `scout`) |
| Commands | None |
| Skills | Global `skill-creator` only |
| This repo | Empty (`opencode-workflow/`) |

Gap: no orchestrator, no dedicated agent team, no permission policy, no
feature-level entry points. The worktree primitive exists but nothing tells an
agent when to use it.

## 3. Decisions (locked)

1. **Lead agent:** create a new primary agent `lead` (do NOT override `build`).
   `build` stays as the escape hatch.
2. **Scope:** project-scoped in this repo first. Packaged as a copyable template
   only after validation (Phase 5).
3. **Models:** provider/model pinning deferred — providers are not confirmed.
   All agent files ship with `model:` unset (inherit defaults) and a documented
   routing table to fill in after `/connect`.
4. **Push approval:** `ask` on **all** `git push*` commands (decision
   2026-08-15 — a bare `git push` pushes the current branch to its upstream
   and would bypass branch-pattern gates). Destructive git operations are
   `ask`.
5. **Dynamic model routing plugin:** not needed (2026-08-15) — dedicated agents
   with static per-agent model routing suffice; Phase 6 removed.
6. **No "read AGENTS.md" instructions** (2026-08-15): opencode auto-injects
   AGENTS.md into every session, including subagents. Agent prompts rely on
   the injected constitution instead of instructing agents to read it.
7. **Fork the worktree plugin** (2026-08-15): the global worktree plugin is
   forked into this repo, adapted to the harness workflow (Termux terminal
   detection, `worktree_apply` merge-back, stale-worktree GC) and validated
   in Phase 4.5 **before** it is packaged into the copyable template in Phase 5.
   > **Status (2026-08-15): DONE.** Fork implemented, active at the global path
   > `~/.config/opencode/plugins/` (edited in place by the user), and validated —
   > see §4.5.5. It is not staged in `.opencode/plugin/` as originally sketched —
   > the move into the repo is Phase 5 work (§5.3).
8. **Constitution injection** (2026-08-15): the Harness Constitution moved from
   `AGENTS.md` to `.opencode/constitution.md`, injected into every agent via the
   `instructions` field in `opencode.json`. `AGENTS.md` is workspace-specific
   notes only — a copied harness leaves AGENTS.md clear for the new project's
   own instructions. Skills were rejected as the carrier: they load on demand,
   while the constitution must be unconditionally present in every agent's
   context.
9. **Delegation-first policy** (2026-08-15, Phase 4.6): the lead is an
   orchestrator, not an implementer — execution (investigation, planning,
   implementation, test iteration, review) is delegated to subagents; the
   lead's context is reserved for coordination. Enforced via prompt policy
   (`lead.md` + constitution §3a), not permissions — the lead keeps `edit`/
   `bash` for integration fixes (merge conflicts, one-line corrections).

## 4. Target architecture

```text
                    USER (product owner)
                             │  "Build X feature"
                             ▼
              ┌─────────────────────────────┐
              │      lead (primary agent)    │
              │  orchestrates the loop, owns │
              │  delegation via permission:  │
              │  task                        │
              └───────┬─────────┬────────────┘
                      │         │
              ┌───────┴───┐ ┌───┴────────┐
              ▼           ▼ ▼            ▼
         planner      coder       reviewer   researcher
        (subagent)  (subagent)   (subagent)  (subagent)
          read-only  full tools   read-only   read-only
                         │            │
                         ▼            ▼
                  tests/lint      verification
                         │            │
                         ▼            ▼
                      git commits (never push)
                         │
                         ▼
                    USER REVIEW ("Good. Next…")
```

- **Permissions** (`opencode.json`) = safety net / approval gates.
- **`.opencode/constitution.md`** = harness constitution (division of
  responsibility, approval boundary, loop contract), injected into every agent
  via the `instructions` field in `opencode.json`.
- **AGENTS.md** = workspace-specific notes only (project facts, conventions).
- **Commands** (`/feature`, `/ship`) = feature-level entry points.
- **Worktree plugin** = parallel-isolation primitive, invoked by `lead` when
  tasks are independent.

## 5. Model routing strategy

Per-agent `model:` pins once providers are connected. Leave unset now —
agents inherit the session/global model.

| Task type | Agent | Tier | Fill in after `/connect` |
|---|---|---|---|
| Architecture / planning | `planner` | Strongest reasoning | e.g. `anthropic/claude-opus-4-5` |
| Implementation | `coder` | Strong coding | e.g. `anthropic/claude-sonnet-4-5` |
| Orchestration | `lead` | Global default | set `"model"` in `opencode.json` |
| Review (independent) | `reviewer` | Second provider / independent model | e.g. `openai/gpt-5-2` |
| Research | `researcher` | Fast / cheap | e.g. global `small_model` |
| Repo exploration | `explore` (built-in) | Fast / small | inherits |

Variant note: reasoning-effort variants (`high`, `max`, `low`) can be set per
agent via `variant:` once the chosen models support them.

---

## Phase 0 — Repository scaffold

**Files:**

| Path | Purpose |
|---|---|
| `PLAN.md` | This document |
| `.gitignore` | Ignore opencode runtime state |
| `opencode.json` | Project config: default agent + global permission safety net |
| (none) | **`git init`** — this folder is not a git repo yet. Required before any worktree/git validation (Phase 4) |

> **Sequencing fix:** do NOT set `default_agent` in Phase 0. `default_agent`
> must point to an existing non-hidden primary agent; `lead.md` arrives in
> Phase 2. Add `"default_agent": "lead"` to `opencode.json` as part of
> Phase 2 instead.

### `.gitignore`

```gitignore
node_modules
.opencode/.cache
*.log
```

### `opencode.json` (Phase 0 version — no `default_agent` yet)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "allow",
      "git push*": "ask",
      "git reset --hard*": "ask",
      "git branch -D*": "ask",
      "git clean -f*": "ask",
      "git push --force*": "ask",
      "rm -rf*": "ask",
      "npm publish*": "ask"
    },
    "webfetch": "allow",
    "websearch": "allow"
  }
}
```

Rules to remember:

- `bash` pattern objects are evaluated **last-match-wins** — broad `"*": "allow"`
  goes first, narrow `ask` rules after.
- **`git push*` asks on ALL pushes** (decision 2026-08-15): a bare `git push`
  pushes the current branch to its upstream and would bypass branch-specific
  patterns; asking on every push is the safe default and one keystroke to
  approve. `git push --dry-run*` is deliberately NOT excluded — keep
  verification pushes visible; exempt explicitly later if they annoy.
- Extend the `ask` list during validation with whatever the sandbox exercises
  (deploy scripts, `sqlite3` destructive ops, etc.).

**Acceptance:** `opencode` starts in this repo with no config errors (default
agent is still `build` until Phase 2 adds `lead`); any `git push` prompts;
non-push git (status/diff/commit/branch/worktree) does not.

> **Status (2026-08-15): DONE.** `opencode.json` + `.gitignore` in place; `git push*`
> prompts verified live (scenario 5); non-push git does not prompt.

## Phase 0.5 — Git init

Run `git init` in this folder and make an initial commit of `PLAN.md`,
`RESEARCH-grok-build.md`, and the Phase 0 files. Without a git repo the
worktree plugin and Phase 4 scenarios cannot run.

> **Status (2026-08-15): DONE.** Repo initialized; commit history now spans
> Phases 0–4.5.

---

## Phase 1 — Harness constitution (`AGENTS.md`)

**File:** `AGENTS.md` (repo root — opencode auto-loads it into every agent's
context in this project).

> **Superseded 2026-08-15 (decision 8):** the constitution below moved to
> `.opencode/constitution.md`, injected via the `instructions` field in
> `opencode.json`. `AGENTS.md` now holds workspace-specific notes only. The
> content below is preserved as the historical Phase 1 record.

This is the behavioral contract. Content:

### 1. Division of responsibility

**User owns:** product vision/direction, feature scope, UX/design, major
architectural direction, security policy, deployment strategy, production
changes, credentials/secrets, final approval of consequential decisions.

**Agents own:** repo exploration, architecture understanding, planning,
implementation, refactoring, routine architecture decisions, builds, tests,
debugging, iteration on failures, lint/format, dependency inspection, docs,
git status/diff/history, branches/worktrees, routine commits, code review,
verification, delegation, parallelization.

### 2. Approval boundary (stop and ask the user)

- Production deployments
- `git push` to protected branches (`main`, `develop`)
- Destructive git: `reset --hard`, `branch -D`, `clean -f`, force push
- Deleting significant amounts of code
- Destructive DB operations / production migrations
- Modifying auth/security architecture, secrets, access-control policies
- Major infrastructure changes
- Significant new dependency when alternatives exist
- Changing the project's fundamental architecture
- Irreversible external API operations / financial-cost actions
- Actions exposing private data
- Deviating substantially from the requested feature

Everything else is executed autonomously.

### 3. The engineering loop (lead's contract)

1. Understand the goal — ask only if genuinely ambiguous.
2. Inspect the repo: read AGENTS.md instructions, map architecture, check git
   status/history when relevant.
3. Plan: identify affected components, dependencies, risks.
4. Delegate: `planner` → `coder` → `reviewer`; use `explore`/`researcher` for
   investigation; use worktrees for independent parallel work.
5. Implement production-quality code consistent with conventions; redesign
   only what is clearly inadequate (flag it).
6. Verify: run tests, lint, type checks; debug and iterate on failures.
7. Review: independent `reviewer` pass; fix findings.
8. Document: update relevant docs.
9. Commit: routine commits are allowed; never push without approval.
10. Report concisely: what changed, how verified, what needs human judgment.

### 4. Reporting format

Every completed task ends with a short report:

- **Done:** 1–3 lines, feature-level (not file-level) summary
- **Verified:** tests/lint results
- **Decisions:** anything redesigned or deviated from convention
- **Needs you:** anything requiring human judgment, approval-gate items

**Acceptance:** run `opencode` here and ask any agent "what are your
constraints?" — the agent should recite the division of responsibility and
approval boundary.

> **Status (2026-08-15): DONE.** Constitution lives at `.opencode/constitution.md`,
> injected via `instructions` (decision 8); AGENTS.md trimmed to workspace notes.
> Scenario 12 (recitation after a restart) is applied and pending live verification.

---

## Phase 2 — Dedicated agent team

All agents live in `.opencode/agents/<name>.md` (project-scoped). Each is a
custom system prompt with its own role, tool permissions, and model slot.

### 2.1 `lead.md` — orchestrator (primary)

> **Also in Phase 2:** add `"default_agent": "lead"` to `opencode.json` now
> that `lead` exists (do not set it in Phase 0 — opencode fails to start if
> `default_agent` names a missing agent).

```markdown
---
description: Lead engineering agent. Takes feature-level objectives and runs the full engineering loop — inspect, plan, delegate, implement, verify, review, document, commit. Use for any feature request.
mode: primary
temperature: 0.2
permission:
  task:
    "*": deny
    "planner": allow
    "coder": allow
    "reviewer": allow
    "researcher": allow
    "explore": allow
  bash:
    "*": allow
    "git push*": ask
    "git reset --hard*": ask
    "git branch -D*": ask
    "git clean -f*": ask
    "git push --force*": ask
    "rm -rf*": ask
---

You are the engineering department. You take feature-level objectives and run
them to completion autonomously.

Your loop, always:
1. Understand the goal. Clarify only if it is genuinely ambiguous.
2. Inspect: map the existing architecture, check git status and history
   when relevant. Use explore/researcher for investigation.
3. Plan: affected components, dependencies, risks. Track with todowrite.
4. Delegate to specialized subagents via the task tool:
   - planner — architecture/implementation planning (non-trivial work)
   - coder — implementation, tests, iteration on failures
   - reviewer — independent review after implementation
   - researcher — dependency/API/external research
   - explore — fast codebase lookup
   Delegate in parallel when tasks are independent. Use worktree_create when
   work should be isolated, then merge the branch back.
5. Implement production-quality code yourself for routine changes; follow the
   project's conventions exactly. Redesign only what is clearly inadequate —
   and say so in your report.
6. Verify: run the project's tests, lint, and type checks. Debug and iterate
   on every failure. Never report a feature done while a test is red.
7. Review: dispatch reviewer for an independent pass and fix findings.
8. Document: update the relevant documentation.
9. Commit: create routine commits with clear messages. NEVER push.
10. Report concisely: Done / Verified / Decisions / Needs you.

Stop and ask the user ONLY for items on the approval boundary: deploys, push
to protected branches, destructive git or DB operations, security/auth
changes, secrets, major new dependencies, architecture changes, substantial
deviations from the request. Everything else: just do it.

Never touch credentials. Never expose secrets in output. Never commit secrets.
```

### 2.2 `planner.md` — architecture & planning (subagent)

```markdown
---
description: Architecture and planning subagent. Analyzes the codebase and produces concrete implementation plans with file-level steps, tests, and risks. Read-only.
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "git status*": allow
    "git log*": allow
    "git diff*": allow
    "git show*": allow
    "git branch*": allow
    "ls *": allow
  webfetch: allow
---

You are the architecture and planning specialist. Given a feature goal:

1. Map the existing architecture: entry points, data flow, conventions,
   existing abstractions.
2. Identify affected components and dependencies, including hidden coupling.
3. Flag anything clearly inadequate for the goal — propose the redesign.
4. Produce a concrete plan:
   - Goal restated in one sentence
   - Architecture decisions (and why)
   - File-by-file changes (create/modify/delete) with purpose
   - New dependencies, if any (flag if a significant one can be avoided)
   - Test plan: what to test and how
   - Risks and mitigations
5. Keep the plan consistent with project conventions. Never modify files.
```

### 2.3 `coder.md` — implementation (subagent)

```markdown
---
description: Implementation subagent. Writes production-quality code, runs tests and lint, iterates on failures until green.
mode: subagent
permission:
  bash:
    "*": allow
    "git push*": deny
    "git reset --hard*": deny
    "git clean -f*": deny
    "git branch -D*": deny
---

You are the implementation engineer. Given a plan or goal:

1. Read the surrounding code first — conventions matter more than
   cleverness.
2. Implement file-by-file, production quality: correct, tested, consistent
   with existing style and abstractions.
3. Run the project's test/lint/type-check commands after each meaningful step.
   Debug and iterate until everything passes. Do not move on from a failure.
4. If the plan is wrong (impossible, inadequate, outdated), stop and report
   the discrepancy instead of improvising a worse design.
5. Do not push, force-push, hard-reset, or clean. Routine commits are allowed
   only when instructed by the lead.
```

### 2.4 `reviewer.md` — independent review (subagent)

```markdown
---
description: Independent code review subagent. Reviews changes for correctness, security, regressions, and convention adherence. Read-only except running tests/lint.
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "git status*": allow
    "git log*": allow
    "git diff*": allow
    "git show*": allow
    "git branch*": allow
    "npm test*": allow
    "npm run lint*": allow
    "npm run typecheck*": allow
    "pytest*": allow
    "python -m pytest*": allow
    "go test*": allow
    "cargo test*": allow
    "ls *": allow
---

You are the independent reviewer. Review the implemented changes with fresh
eyes, before the author's bias:

1. Read the diff (git diff against the base branch) and surrounding context.
2. Check: correctness and edge cases, security (injection, secrets, authz),
   regressions, performance, error handling, convention adherence, dead code.
3. Run the test suite and lint yourself where possible.
4. Report findings as a prioritized list: Critical / Should fix / Nits.
   Be specific (file:line). Never modify files yourself.
```

### 2.5 `researcher.md` — research (subagent)

```markdown
---
description: Research subagent. Investigates dependencies, libraries, APIs, and external documentation. Read-only.
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "ls *": allow
  webfetch: allow
  websearch: allow
---

You are the research specialist. Given a question:

1. Use websearch/webfetch for external docs, APIs, library usage, version
   compatibility, and known issues.
2. Inspect locally installed dependencies (package files, lockfiles) to
   confirm versions and available APIs.
3. Answer with citations (URLs) and a practical recommendation relevant to
   this project. Be concise: answer, evidence, recommendation.
4. Never modify files.
```

**Model wiring (deferred):** add `model:` + optional `variant:` to each
frontmatter per the table in §5 once providers are connected.

**Acceptance:**

- Tab cycles to `lead` in this repo.
- `@planner`, `@coder`, `@reviewer`, `@researcher` appear in autocomplete.
- `lead` can call each allowed subagent; a stray `@scout` mention still works
  for the user, but `lead`'s task tool denies delegations outside the allowlist.
- `planner`/`reviewer`/`researcher` cannot edit; `coder` cannot push.

> **Status (2026-08-15): DONE.** All five agents in `.opencode/agents/`;
> `"default_agent": "lead"` set; roles/permissions exercised by scenarios 1–7.

---

## Phase 3 — Feature-level commands

Commands live in `.opencode/commands/<name>.md`. They are the user-facing
"product-owner console".

### 3.1 `feature.md` — the primary entry point

```markdown
---
description: Start a feature-level request through the lead engineering agent.
agent: lead
---

$ARGUMENTS

Use the existing architecture where appropriate, but redesign anything that is
clearly inadequate. Make it production quality, test it thoroughly, update the
relevant documentation, and keep the implementation consistent with the
project's conventions. Take full ownership of the engineering loop and report
back concisely when done.
```

Usage: `/feature Add user authentication using OAuth. …`

### 3.2 `ship.md` — close out current work

```markdown
---
description: Verify, review, document, and commit the current work. Does not push.
agent: lead
---

Close out the current work: run the full test suite, lint, and type checks;
fix any failures; dispatch reviewer for an independent pass and fix findings;
update the relevant documentation; create clear routine commits. Then report:
Done / Verified / Decisions / Needs you. Do not push.
```

### 3.3 Optional `status.md`

```markdown
---
description: Summarize current repo and git state.
agent: lead
---

Report briefly: current branch, uncommitted changes, recent commits, and any
work in progress. No changes, no commits.
```

**Acceptance:** `/feature` and `/ship` work from this repo; commands route to
`lead`; `$ARGUMENTS` passes through verbatim.

> **Status (2026-08-15): DONE.** `feature.md`, `ship.md`, `status.md` in
> `.opencode/commands/`; routing through `lead` exercised by scenarios 2–7.

---

## Phase 4 — Sandbox validation (this repo)

Goal: prove the loop end-to-end with zero risk before packaging the template
(Phase 5). All of Phase 4 is executed inside this repository.

### 4.1 Files to add

| Path | Purpose |
|---|---|
| `sandbox/` | Tiny dummy project (e.g., a 3–5 file Python or Node package with a real test suite) that the harness can chew on |
| `sandbox/AGENTS.md` | Second set of project-specific instructions → tests that agents read nested conventions |
| `sandbox/README.md` | Declares the dummy project's "product intent" so `lead` treats it as a real feature surface |
| `.opencode/worktree.jsonc` | Explicit worktree plugin config for this repo |
| `docs/validation.md` | Scenario checklist + expected outcomes + sign-off table |

> **Environment note (verified 2026-08-15):** `pytest` is NOT installed on
> this Termux box; Node v26 and Python 3.14 are. The sandbox uses **Python
> `unittest`** (stdlib, zero install) as its test runner.

### 4.2 `.opencode/worktree.jsonc`

```jsonc
{
  "$schema": "https://registry.kdco.dev/schemas/worktree.json",

  "sync": {
    "copyFiles": [],
    "symlinkDirs": [],
    "exclude": []
  },

  "hooks": {
    "postCreate": [],
    "preDelete": []
  }
}
```

### 4.3 Validation scenarios (run in order)

1. **Inspect & understand** — ask `lead`: "Summarize what this project does
   and its architecture." Expect: correct map, conventions cited.
2. **Convention compliance** — `/feature Add a small, well-scoped feature to
   the sandbox (e.g., a `--version` flag or a new testable function).` Expect:
   plan → implementation → green tests → commit → concise report. No approval
   prompts.
3. **Failure iteration** — request something that deliberately breaks a test
   (e.g., "add caching" on a component whose tests assert no caching). Expect:
   harness hits red tests, debugs, either fixes properly or reports the
   conflict — never reports done with red tests.
4. **Review pass** — `/ship` after introducing a deliberate smell (inject a
   suspicious line into the sandbox before running). Expect: reviewer flags
   it, coder fixes it.
5. **Approval gate** — run `/ship` then manually `git push origin main` via
   bash. Expect: `ask` prompt. Push to a feature branch: no prompt.
6. **Docs update** — change behavior and confirm README/doc updates land in
   the same work session.
7. **Delegation depth** — give a two-part feature (frontend + backend halves
   in the sandbox). Expect: `lead` delegates in parallel or serializes
   sensibly without user orchestration.
8. **Worktree (Termux risk)** — trigger `worktree_create` for an independent
   task. **Known risk:** the plugin opens a new terminal; on Termux this may
   not be supported (cmux/terminal detection). If it fails, record the failure
   in `docs/validation.md` and fall back to plain `git worktree add` via bash
   until the plugin is adapted. Do not let this block Phases 1–3.
   > **Resolved 2026-08-15 (Phase 4.5):** the plugin was forked & adapted — it
   > spawns **no terminals at all** (work happens via bash + `worktree_apply`),
   > removing the Termux terminal-detection failure entirely. Scenario 8 passed;
   > see `docs/validation.md`.

### 4.4 Sign-off

Each scenario gets a row in `docs/validation.md`: status (pass/fail/blocked),
notes, and what to fix. **No file is packaged into the Phase 5 template until
scenarios 1–7 pass.**

> **Status (2026-08-15): DONE.** Sandbox + `docs/validation.md` in place; scenarios
> 1–8 pass (sign-off table in `docs/validation.md`).

---

## Phase 4.5 — Fork & adapt the worktree plugin

The worktree plugin (global `~/.config/opencode/plugins/worktree.ts` +
`worktree/` + `kdco-primitives/`) is forked into this repo, modified to fit
the harness workflow, and validated — **before** it is packaged in Phase 5.

### 4.5.1 Why

The plugin is the isolation primitive for the delegation loop, but it is not
ours. Three issues surfaced during Phase 4 testing/research:

1. **Termux terminal detection fails.** `detectTerminalType()` (in
   `worktree/terminal.ts` + `kdco-primitives/terminal-detect.ts`) uses tmux
   only when the process is *already inside* a tmux session (`TMUX` env var),
   then falls back to cmux (absent) and Linux desktop terminals (absent on
   Termux). Result: `No terminal emulator found` (observed 2026-08-15) even
   though tmux is installed.
2. **No merge-back.** The plugin offers `worktree_create` / `worktree_delete`
   only; child worktree changes must be merged into the main checkout
   manually. grok-build solves this with `workspace.apply_worktree`
   (`ApplyMode::Overwrite` / `Merge` + conflict report) — flagged as the
   **highest-value gap** in `RESEARCH-grok-build.md` §4.
3. **No stale-worktree GC.** Abandoned worktrees accumulate; grok-build
   mirrors this with auto-GC (`xai-fast-worktree/src/auto_gc.rs`).

Fork location: `.opencode/plugin/` (project-scoped auto-discovery). The
global plugin remains untouched until the fork passes validation.
**2026-08-15:** the fork currently runs at the global path (user-edited in place);
moving it into `.opencode/plugin/` so the plugin travels with the template is
Phase 5 work (§5.3).

### 4.5.2 Steps

1. **Fork into the repo:** copy `~/.config/opencode/plugins/worktree.ts`,
   `worktree/`, and `kdco-primitives/` into `.opencode/plugin/`, preserving
   structure. Note: project plugins auto-register alongside global ones, so
   while testing the fork, disable the global copy (move it aside) to avoid
   duplicate tool registration.
2. **Fix terminal detection** (Termux):
   - inside tmux → tmux window (unchanged);
   - else if `tmux` binary exists → start a detached tmux session/window for
     the worktree (Termux path — this is the fix);
   - else if cmux → cmux workspace (unchanged);
   - else → platform terminal (unchanged).
3. **Add `worktree_apply` tool** (mirrors grok `workspace.apply_worktree`):
   - `mode: overwrite` (default) — copy the child worktree's changes over the
     main tree;
   - `mode: merge` — merge the child's changes into the main working
     directory; report conflicts (file list) and a copied-changes summary;
     leave conflicts unstaged for `lead`/user resolution.
4. **Add stale-worktree GC:** on plugin load and before each create, prune
   worktrees whose session/branch is gone or older than a configured max-age;
   mirror `auto_gc.rs` semantics on top of the plugin's SQLite state.
5. **Wire the workflow (make it ours):**
   - `lead.md` delegation conventions: `worktree_create` in parallel for
     independent tasks; `worktree_apply` (merge) back to the main checkout
     before the final report; flat delegation — subagents never delegate
     (grok's depth limit = 1).
   - `.opencode/worktree.jsonc` config for this repo (already present from
     Phase 4).
6. **Validate:** extend `docs/validation.md` with scenarios 9–11 below and
   run them; record outcomes in the sign-off table.

### 4.5.3 New validation scenarios

| # | Scenario | How to run | Expected |
|---|---|---|---|
| 9 | Worktree create on Termux | From inside tmux, trigger `worktree_create` for an independent task | Worktree session opens in a new tmux window; isolated work completes; no "No terminal emulator found" |
| 10 | Merge-back (`worktree_apply`) | Work in a worktree (change + commit), then `worktree_apply` with `merge`; introduce an overlapping edit to force a conflict | Changes merge into main; conflicts reported as a file list; no data loss |
| 11 | Stale-worktree GC | Abandon a worktree (close its session), reload opencode, list worktrees | Abandoned worktree pruned automatically |

### 4.5.4 Acceptance / sign-off

- Fixes 1–3 validated; scenarios 9–11 pass and are recorded in
  `docs/validation.md` alongside scenarios 1–8.
- `worktree_create`, `worktree_apply`, `worktree_delete` work from `lead`
  with the project-scoped fork (global copy disabled during testing).
- Phase 5 packages the **fork** (moved into `.opencode/plugin/`) into the copyable
  template only after this sign-off.

### 4.5.5 Implementation status (2026-08-15) — DONE

- **Steps 1–5 complete.** The fork lives at the **global** path
  `~/.config/opencode/plugins/` (`worktree.ts` + `worktree/` + `kdco-primitives/`),
  edited in place by the user — it was **not** staged in `.opencode/plugin/` as step 1
  sketched. The pre-fork original is not backed up in this repo yet (Phase 5 vendors
  the upstream original under `vendor/` and moves the fork into `.opencode/plugin/` —
  see §5.3).
- **Fix 1 implemented differently than sketched:** instead of a tmux fallback, the fork
  spawns **no terminals at all** — `worktree_create` registers the worktree, the agent
  works there via the bash tool (`workdir`) or delegated subagents, and `worktree_apply`
  merges back. This removes the Termux terminal-detection problem entirely (no
  "No terminal emulator found").
- **Fix 2 done:** `worktree_apply` tool with `merge` / `overwrite` modes and a conflict
  file-list report.
- **Fix 3 done:** `runGc` on plugin load, before create, and on session idle — registry
  cleanup for entries whose worktree no longer exists + age-based pruning (default
  `maxAgeDays: 30`, `onlyIfMerged`, never prunes without a recorded base branch).
- **Step 6 done:** scenarios 9–11 ran and passed — results in `docs/validation.md`.
- **Correction (2026-08-15):** step 5's "flat delegation — subagents never delegate"
  rule (grok's depth limit = 1; RESEARCH-grok-build.md §1.4, adoption in §4) is **not
  yet written into `lead.md`/`.opencode/constitution.md`** — the parallel-delegation
  and `worktree_apply` conventions are present, the flat-delegation rule is not.
  Note: the rule is already **structurally enforced** — none of the subagent
  frontmatter files define `permission.task`, so subagents cannot delegate regardless
  of prompt text; the missing piece is prompt-text polish only. Open item; fold into
  Phase 5 or a quick follow-up edit.

### 4.5.6 Gap-fix round (2026-08-15) — DONE

Gaps raised in review of the Phase 4.5 validation run; all landed in the fork
(`~/.config/opencode/plugins/worktree.ts`):

1. **Branch cleanup** — `worktree_delete(deleteBranch: "auto" | "always" | "never")`,
   default `auto`: `git branch -d` when merged into the base, `-D` for `always`, kept for
   `never`. Verified live: branch deleted after worktree removal.
2. **Manual GC trigger** — new `worktree_gc(dryRun?, maxAgeDays?)` tool; `runGc` now
   returns a report (`pruned` / `unregistered` / `kept` with reasons) instead of
   swallowing results. Verified: clean dry-run, prune report, kept-with-reason.
3. **Age path testable** — `worktree_gc(maxAgeDays: 0)` exercises the age-based prune
   in-session (`now` override for deterministic tests); `worktree_list` flags expired
   entries with `*`. **Verified live:** dry-run flagged `wt/gc-age-probe2` ("expired and
   merged"), run pruned its git worktree + registry entry; no-base-branch entry kept
   (GC safety).
4. **Topology** — `worktree_apply(noFF: true)` forces a merge commit via `--no-ff`;
   default stays linear. (User smoke-tested both topologies in a scratch repo.)
5. **Dead defaults removed** — `worktree_delete` requires `branch` (dropped
   `getWorktreeForCwd`) and gained `commitPending: false` to discard changes instead of
   snapshot-committing.
6. **Divergence healed** — `worktree_list` reconciles with git on every call:
   unregisters entries with no live git worktree, shows git-only worktrees as
   `(unregistered)`. Verified: `main` appears as `(unregistered)`.
7. **Conflict helper** — `worktree_resolve_conflicts(strategy: "ours" | "theirs" |
   "abort")`; ours/theirs resolve + stage all conflicted files (merge stays pending,
   finish with `git commit`), `abort` runs `git merge --abort`. (User smoke-tested.)

Verification: user ran `tsc --noEmit` (clean for touched files; only pre-existing
`get-project-id.ts` errors remain) and a scratch-repo smoke test (`/usr/tmp/opencode/wt-smoke.sh`,
10 scenarios: linear vs `--no-ff` topology, `-d`/`-D` semantics, conflict resolution,
pending-merge-until-commit, abort, porcelain parsing, ancestor checks). Independent
confirmation in-session 2026-08-15: tool wiring, GC reports, age-path prune, list
reconciliation, and `deleteBranch: auto` all verified live. README updated throughout.

---

## Phase 4.6 — Delegation-first workflow & command integration (planned 2026-08-15)

Goal: fix two weaknesses observed in real usage — (1) the lead agent still does
too much work itself (implementation, investigation, test iteration), defeating
the context-management and parallelism design; (2) the commands (`/feature`,
`/ship`, `/status`) are thin wrappers disconnected from the workflow — they
never mention worktrees, parallel delegation, or the plan/review checkpoints.

### 4.6.1 Problem analysis

**Lead does too much.** Root causes:

- `lead.md` step 5 explicitly permits: "Implement production-quality code
  yourself for routine changes" — an open invitation to self-implement.
- No delegation *rules*: when to delegate vs. self-serve is left to model
  discretion, and models default to doing work themselves (less overhead,
  more control).
- No context-management guidance: the lead's context is consumed by file
  reads, diffs, and test output that should live in subagent contexts. The
  lead's context is the session's coordination budget — every self-served
  read shrinks it.
- The worktree parallel pattern exists as tools (`worktree_create` /
  `worktree_apply`) but the lead prompt never describes the create → parallel
  coder → merge-back workflow, so it is rarely used.

**Commands disconnected.** Root causes:

- Commands are one-liners ("do the loop") that encode no workflow structure —
  the loop lives only in the lead's prompt, so commands add nothing.
- No command references the worktree tools; `/ship` would close out work
  without applying pending worktrees.
- No plan/review checkpoints for the product owner (`/plan`, `/review`) —
  the user cannot approve a plan before implementation or request a review
  pass without re-running the whole loop.
- `/status` omits worktree state even though `worktree_list` exists.

### 4.6.2 Changes (file-level)

| File | Change |
|---|---|
| `.opencode/agents/lead.md` | Rewrite: orchestrator-not-implementer role; delegation rules table (work → agent); context-management rules; worktree parallel pattern; flat delegation; final report must list which subagents did what |
| `.opencode/constitution.md` | Rewrite §3 loop to delegation-first; add §3a "Delegation policy" (delegation table, context rules, parallelism, flat delegation) |
| `.opencode/agents/coder.md` | Add: worktree awareness (work in the given directory via bash `workdir`); concise reporting (no full file/test dumps) |
| `.opencode/agents/planner.md` | Add: concise plan output (lead passes it to coder); no file dumps |
| `.opencode/agents/reviewer.md` | Add: concise findings (file:line list); no full diff dumps |
| `.opencode/agents/researcher.md` | Add: concise answer/evidence/recommendation (mostly present) |
| `.opencode/commands/feature.md` | Rewrite: encode the full delegation-first workflow incl. worktree parallelism |
| `.opencode/commands/ship.md` | Rewrite: worktree-aware close-out (apply pending worktrees first) |
| `.opencode/commands/status.md` | Add worktree state to the report |
| `.opencode/commands/plan.md` | **NEW** — plan-only checkpoint: planner → present plan → stop for user approval |
| `.opencode/commands/review.md` | **NEW** — review-only pass: reviewer → delegate fixes → report |
| `.opencode/commands/worktree.md` | **NEW** — worktree management: list/create/apply/delete/gc |
| `docs/validation.md` | Add scenarios 13–16 |
| `README.md` | Update agents/commands tables; add "Delegation & parallelism" section |

### 4.6.3 Validation scenarios (13–16)

| # | Scenario | How to run | Expected |
|---|---|---|---|
| 13 | Delegation-first | `/feature` a small sandbox feature | Transcript shows `coder` implemented (lead never edited code); lead's report lists subagent contributions |
| 14 | Parallel worktrees | `/feature` two independent sandbox features | Two worktrees created; parallel coders; both merged back via `worktree_apply`; tests green |
| 15 | Command integration | `/plan` (stops for approval), `/review` (reviews current diff), `/worktree` (list/create/apply), `/ship` with a pending worktree | Each command routes through `lead` and performs its stage; ship applies pending worktrees first |
| 16 | Context management | Ask `lead` to summarize its own delegation pattern mid-feature | Lead's context stays small: it read few files directly; subagents did the heavy reading |

### 4.6.4 Acceptance

- `lead` never implements features itself (transcript-verifiable).
- Independent tasks run in parallel worktrees by default.
- Commands encode the workflow; plan/review/worktree checkpoints work.
- Scenarios 13–16 pass and are recorded in `docs/validation.md`.
- Phase 5 (portability) then packages the hardened workflow.

**Status (2026-08-15):** planned — implementation pending user go-ahead.

---

## Phase 5 — Portability: copy to any workspace (re-scoped 2026-08-15)

The old goal — graduate the harness to `~/.config/opencode/` — is **dropped**.
New goal: optimize this workflow so it can be **copied into any folder (or
workspace)** and **adapted to other use cases**. Each workspace owns its harness
as a template; nothing is promoted globally.

### 5.1 Why re-scope

- Global promotion would make `lead` a de-facto mandate for every project on this
  machine. A copyable template instead keeps the harness opt-in per workspace,
  lets each project diverge freely, and keeps approval rules local.
- The harness is already project-scoped (`opencode.json`, `.opencode/agents/`,
  `.opencode/commands/`, AGENTS.md). The only non-portable piece is the worktree
  plugin, which currently lives at the global path.
- Dedicated agents with static per-agent model routing are sufficient — no dynamic
  routing plugin (Phase 6 removed, see decision 5).

### 5.2 Copyability audit (2026-08-15)

| Blocker | Detail | Fix |
|---|---|---|
| Plugin at global path | Fork lives at `~/.config/opencode/plugins/`; a copied workspace would get the unadapted upstream plugin (or none) | Move the fork into `.opencode/plugin/` (project-scoped auto-discovery) so it travels with the template; keep the global copy as the pre-existing fallback |
| Plugin dependencies | `.opencode/package.json` pins `@opencode-ai/plugin` but is git-ignored (per-project install) | Document the `bun install` / `npm install` step in setup; lockfile stays out of the template |
| Upstream attribution | Fork diverged from kdcokenny/opencode-worktree (MIT) with no in-repo copy of the original | Vendor the upstream original under `vendor/` for reference/diffing |
| Sandbox is repo-specific | `sandbox/` is this repo's training project — irrelevant to other use cases | Keep it as the demo/validation example; the scenarios are reusable, the project is swappable (§5.3.4) |
| Platform notes | AGENTS.md + lead.md carry Termux environment notes | Mark platform notes as adaptive (Termux vs desktop); the plugin spawns no terminals, so it is platform-neutral |
| `default_agent: lead` | Copyable, but should remain a choice | Document opting out; a copied harness must never hijack an existing workspace's default |

### 5.3 Deliverables

1. **Move the plugin into the repo:** copy `worktree.ts` + `worktree/` +
   `kdco-primitives/` into `.opencode/plugin/` (project-scoped auto-discovery);
   vendor the upstream original under `vendor/` for attribution; verify no duplicate
   tool registration while the global copy still exists (disable or remove the global
   one when the template is adopted).
2. **Template manifest:** a documented file list — `AGENTS.md` (workspace notes),
   `opencode.json` (incl. `instructions` → `.opencode/constitution.md`),
   `.opencode/` (constitution, agents, commands, plugin, worktree.jsonc,
   package.json for deps), `docs/validation.md` (scenario checklist). Everything
   a new workspace needs.
3. **Copy/setup script:** `scripts/init-harness.sh` (or a command) that copies the
   manifest into a target directory and parameterizes the adaptive bits: project
   name, model routing table (currently unset — inherits session/global model),
   platform notes, permission rules.
4. **Adaptation doc:** `docs/portability.md` — how to swap `sandbox/` for your own
   project, re-run scenarios 1–11 against it, tune permissions, and opt out of
   `default_agent`.
5. **Exit criteria:** copy the manifest into a fresh empty directory, restart
   opencode, and verify: agents present and citing the constitution (injected
   via `instructions`), `/feature` + `/ship` route through `lead`, worktree
   tools available with no terminal spawn, scenarios 1–12 pass against a small
   substitute project.

### 5.4 Scope guardrails

- No global config is touched in this phase (no promotion, ever — per §5.1).
- The template is optional: a copied harness can be deleted with zero side effects
  on other workspaces.
- Model routing stays static per-agent (decision 5); Phase 6 is removed.

**Status (2026-08-15):** plan updated; execution pending user go-ahead — this is the
**only remaining phase**. Phase 4/4.5 sign-off complete — all validation scenarios
1–11 pass (`docs/validation.md`).

---

## Appendix A — Execution order summary

1. **DONE** — Phase 0: scaffold repo (`opencode.json`, `.gitignore`) → restart opencode.
2. **DONE** — Phase 1: write the harness constitution (now `.opencode/constitution.md`,
   injected via `instructions`; originally `AGENTS.md`) → verify agents cite it
   (scenario 12 recitation pending a restarted session).
3. **DONE** — Phase 2: create the five agent files → verify roles/permissions.
4. **DONE** — Phase 3: create the three commands → verify routing.
5. **DONE** — Phase 4: build sandbox, run scenarios 1–8, sign off in `docs/validation.md`.
6. **DONE** — Phase 4.5: fork + adapt the worktree plugin (Termux fix, `worktree_apply`,
   GC) → validate scenarios 9–11, sign off.
7. **PENDING** — Phase 4.6: delegation-first workflow & command integration
   (lead = orchestrator, worktree parallelism, `/plan` `/review` `/worktree` commands,
   scenarios 13–16). Planned 2026-08-15; implementation pending user go-ahead.
8. **PENDING** — Phase 5: package the harness as a copyable template for any workspace
   (re-scoped 2026-08-15 — no global promotion; Phase 6 removed). Final phase;
   execution pending user go-ahead.

## Appendix B — Config change reminder

opencode loads config once at startup. After any change to `opencode.json`,
agent files, commands, or skills: **quit and restart opencode**. Running
sessions keep the old config.