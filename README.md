# OpenCode Engineering Harness

> "I am the product architect. The harness is the engineering department."

A thin engineering-operating layer on top of [opencode](https://opencode.ai)
that turns it from an AI-powered text editor into an engineering team you can
delegate feature-level objectives to. You say **what + why**; the harness
determines **how** — inspect, plan, implement, test, review, document, commit —
and closes the loop itself.

This repository is the **staging ground**: everything here is exercised and
validated before being packaged into a copyable template (see `PLAN.md`,
Phase 5). Nothing is promoted to the global opencode config.

---

## How it works

```
                    USER (product owner)
                             │  "/feature Add OAuth login…"
                             ▼
              ┌───────────────────────────────┐
              │        lead (primary agent)    │
              │  orchestrates the loop, owns   │
              │  delegation via permission:    │
              │  task                          │
              └───┬───────┬───────┬───────┬────┘
                  │       │       │       │
                  ▼       ▼       ▼       ▼
             planner   coder  reviewer researcher
            (subagent)(subagent)(subagent)(subagent)
             read-only full tools read-only read-only
                         │       │
                         ▼       ▼
                  tests/lint  verification
                         │       │
                         └───┬───┘
                             ▼
                  git commits (never push)
                             │
                             ▼
                    USER REVIEW ("Good. Next…")
```

Three layers make this work:

| Layer | Where | Role |
|---|---|---|
| **Constitution** | `.opencode/constitution.md` | Behavioral contract — division of responsibility, approval boundary, the engineering loop. Injected into **every** agent via the `instructions` field in `opencode.json` (no agent has to read it). |
| **Agents** | `.opencode/agents/*.md` | The team: one primary orchestrator (`lead`) + four specialized subagents. |
| **Commands** | `.opencode/commands/*.md` | User-facing entry points: `/feature`, `/ship`, `/status`. |

`AGENTS.md` at the repo root holds workspace-specific notes only (project
facts, conventions) — a copied harness leaves it clear for the new project's
own instructions.

## The engineering loop

`lead` runs this loop for every feature-level request:

```
 1. Understand ──► 2. Inspect ──► 3. Plan ──► 4. Delegate ──► 5. Execute
     the goal        the repo      (components,   (planner → coder →   (subagents
     (ask only if     (architecture,  deps, risks)   reviewer; parallel   implement;
      ambiguous)      git state)                     when independent;    lead
                                                     worktrees for        coordinates)
                                                     isolation)
                                                            │
                                                            ▼
 10. Report ◄── 9. Commit ◄── 8. Document ◄── 7. Review ◄── 6. Verify
 (Done/Verified/   (routine,        (update docs)   (independent   (tests, lint,
  Decisions/       NEVER push)                       reviewer pass) type checks)
  Needs you)
```

**Approval boundary** — `lead` stops and asks the user only for: deploys, push
to protected branches, destructive git/DB operations, security/auth changes,
secrets, major new dependencies, architecture changes, and substantial
deviations from the request. Everything else runs autonomously.

## Delegation & coordination

The lead is an **orchestrator, not an implementer** — it delegates execution
to subagents and coordinates from their reports. Each subagent's final
message is shaped for the lead's next decision:

| Work | Subagent | Returns to the lead |
|---|---|---|
| Codebase lookup | `explore` | concise answer to the question |
| External research | `researcher` | answer, evidence (citations), recommendation, unresolved items |
| Architecture / planning | `planner` | complete plan — handed to `coder` as the implementation brief |
| Implementation + tests | `coder` | what changed, verification results, deviations, reviewer focus |
| Independent review | `reviewer` | verdict (approve / needs fixes), prioritized findings, recommendation |

Subagents never delegate — the lead is the only delegator. Independent tasks
run in parallel worktrees: one worktree per task, one `coder` per worktree,
merged back with `worktree_apply`.

## Agents

All agents live in `.opencode/agents/`. `lead` is the primary agent (the
default when opencode starts in this repo); the rest are subagents that only
`lead` can delegate to via the `task` tool.

| Agent | Mode | Role | Access |
|---|---|---|---|
| **`lead`** | primary | Orchestrator. Takes feature-level objectives, runs the loop by delegating execution to subagents, coordinates from their reports, verifies, commits. | `task`: only `planner`, `coder`, `reviewer`, `researcher`, `explore` (all else denied). `bash`: everything allowed **except** `git push*`, `git reset --hard*`, `git branch -D*`, `git clean -f*`, `git push --force*`, `rm -rf*` → **ask** |
| **`planner`** | subagent | Architecture & planning. Maps the codebase, produces file-level implementation plans with tests and risks. | Read-only: `edit` denied; `bash` mostly **ask**, with `git status/log/diff/show/branch` + `ls` allowed; `webfetch` allowed |
| **`coder`** | subagent | Implementation. Writes production-quality code, runs tests/lint, iterates until green. | Full `bash` access **except** `git push*`, `git reset --hard*`, `git clean -f*`, `git branch -D*` → **deny** |
| **`reviewer`** | subagent | Independent review. Reads the diff with fresh eyes, checks correctness/security/regressions, runs tests itself. | Read-only: `edit` denied; `bash` mostly **ask**, with git read commands + test/lint runners (`npm test*`, `pytest*`, `python3 -m unittest*`, `go test*`, `cargo test*`, …) + `ls` allowed |
| **`researcher`** | subagent | Research. Investigates dependencies, APIs, external docs with citations. | Read-only: `edit` denied; `bash` mostly **ask**, `ls` allowed; `webfetch` + `websearch` allowed |

Built-in opencode agents (`explore`, `build`, `general`, `scout`, …) remain
available; `lead` may delegate to `explore` for fast codebase lookups, and
`build` stays as the escape hatch.

### Global permission safety net (`opencode.json`)

Applies to every agent as a last-match-wins layer: `bash` `*` → allow, with
**ask** on `git push*` (all pushes — a bare `git push` cannot bypass the
gate), `git reset --hard*`, `git branch -D*`, `git clean -f*`,
`git push --force*`, `rm -rf*`, `npm publish*`. `webfetch`/`websearch` → allow.

## Commands

User-facing entry points, all routed to `lead`:

| Command | Purpose |
|---|---|
| `/feature <request>` | Start a feature-level request: "Add user authentication using OAuth…". Delegation-first: `lead` coordinates; `explore`/`planner`/`coder`/`reviewer`/`researcher` execute; independent tasks run in parallel worktrees. |
| `/ship` | Close out current work: apply pending worktrees, verify, review (`explore` state check + `reviewer` pass + `coder` fixes), update docs, create routine commits. **Never pushes.** |
| `/status` | Brief repo/git state: current branch, uncommitted changes, recent commits, work in progress, worktree state. |

## Worktree plugin (parallel isolation)

The forked worktree plugin gives `lead` git-worktree isolation for independent
tasks — **without spawning any terminals** (Termux-safe): work happens via
bash/`worktree_apply`, not a new terminal window.

| Tool | Purpose |
|---|---|
| `worktree_create` | Create an isolated worktree for a task |
| `worktree_apply` | Merge child worktree changes back into the main checkout — `merge` (conflict file-list report) or `overwrite`; `noFF` forces a merge commit |
| `worktree_delete` | Remove a worktree; `deleteBranch: auto/always/never`; `commitPending: false` discards changes |
| `worktree_gc` | Prune stale/abandoned worktrees — `dryRun` preview, `maxAgeDays` override, report of pruned/unregistered/kept |
| `worktree_list` | List worktrees, reconciled with git (git-only worktrees shown as `(unregistered)`, expired flagged `*`) |
| `worktree_resolve_conflicts` | Resolve a pending merge: `ours`/`theirs` (resolve + stage, finish with `git commit`) or `abort` |

> **Note:** the fork currently runs at the global path
> (`~/.config/opencode/plugins/`). Moving it into `.opencode/plugin/` so it
> travels with the template is Phase 5 work (`PLAN.md` §5.3).

## Repository layout

```
.
├── PLAN.md                    # Implementation plan + phase status
├── README.md                  # This file
├── AGENTS.md                  # Workspace notes (project facts, conventions)
├── opencode.json              # Config: constitution injection, default agent, permissions
├── RESEARCH-grok-build.md     # Research: grok-build harness (parallel tasks, worktrees)
├── .opencode/
│   ├── constitution.md        # Harness constitution (injected into every agent)
│   ├── agents/                # lead, planner, coder, reviewer, researcher
│   ├── commands/              # feature, ship, status
│   └── worktree.jsonc         # Worktree plugin config
├── sandbox/                   # Training project (Python + unittest) used to validate the harness
│   ├── AGENTS.md              # Sandbox-specific conventions (nested AGENTS.md test)
│   └── README.md              # Sandbox "product intent"
├── docs/
│   └── validation.md          # Scenario checklist + sign-off (scenarios 1–12)
└── .gitignore
```

> Git-ignored items not shown: `.opencode/package.json` + lockfile + `node_modules/`
> (plugin dependency install, per-project — see `PLAN.md` §5.2).

## Quick start

1. Install opencode (tested on opencode 1.18.18, Termux/Android).
2. Clone/copy this repo and restart opencode — config is loaded once at
   startup, so **restart after any change** to `opencode.json`, agents,
   commands, or skills.
3. Run the sandbox tests to confirm the environment:
   `python3 -m unittest discover -s sandbox`
4. Try it: `/feature Add a --version flag to the sandbox CLI, with tests.`
5. Close out: `/ship` — then review the report (`Done / Verified / Decisions /
   Needs you`).

## Validation status

The harness is validated end-to-end against `sandbox/` — see
`docs/validation.md` for the full scenario checklist and sign-off table:

- **Scenarios 1–11 pass** (2026-08-15): inspect & understand, convention
  compliance, failure iteration, review pass, approval gate, docs update,
  delegation depth, worktree create/merge-back/GC on Termux.
- **Scenario 12** (constitution injection recitation) is applied and pending
  live verification after an opencode restart.
- **Phase 5** (package as a copyable template) is the only remaining phase —
  planned, not started.

## Docs

- `PLAN.md` — full implementation plan, decisions, phase status
- `docs/validation.md` — validation scenarios and sign-off
- `RESEARCH-grok-build.md` — research on grok-build's parallel-task/worktree
  design and what was adopted