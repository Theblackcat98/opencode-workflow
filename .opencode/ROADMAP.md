# Roadmap

> **This file is the only source of approved features.** If an idea is not
> listed here as approved, it is not approved — do not design, plan, or build
> it. To propose something, add it under "Proposed" and get human approval
> before moving it to "Approved". Detail checklists under each item are part
> of the approval — don't silently drop them.

## Approved — not yet done

| # | Pri | Feature | Status |
|---|---|---|---|
| R1 | P0 | Scenario 12 verification after an opencode restart | Pending live check |
| R2 | P1 | Phase 4.6 remainder: delegation-first enforcement + `/plan`, `/review`, `/worktree` commands + scenarios 13–16 | Planned, not started |
| R3 | P1 | Phase 5: package the harness as a copyable template | Planned, not started |
| R4 | P1 | Permission hardening (`lead`, `coder`) + hard-vs-judgment gate taxonomy | Not started |
| R5 | P1 | Workflow state machine with explicit states and invariants | Not started |
| R6 | P1 | Parallel planning (task DAG) + worktree lifecycle invariants | Not started |
| R7 | P1 | Reviewer independence (unbiased input + output contract) | Not started |
| R8 | P3 | Validation hardening (regression + invariant tests) | Not started |

### R1 detail — Scenario 12

Constitution recitation without reading any file, by `lead`, a subagent
(`planner`), and a built-in (`explore`) — proves `instructions` injection
reaches primary, subagents, and built-ins. Confirm `AGENTS.md` holds zero
constitution text. Mark PASS only after live verification in a restarted
session (config loads once at startup). Release blocker for R3.

### R2 detail — Phase 4.6 remainder

- New commands: `/plan` (planner → present plan → stop for user approval),
  `/review` (reviewer pass → delegate fixes → report), `/worktree`
  (list/create/apply/delete/gc).
- Open structural question: deny `edit`/`webfetch`/`websearch` to `lead`
  (capability-level orchestration), or keep prompt-level policy? Human decides.
- Scenarios 13–16: (13) transcript shows `coder` implemented, lead never
  edited; (14) two worktrees + parallel coders merged via `worktree_apply`,
  tests green; (15) each new command performs its stage, `/ship` applies
  pending worktrees first; (16) lead's context stays small mid-feature.

### R3 detail — copyable template

- Move the worktree-plugin fork into `.opencode/plugin/` (project-scoped
  auto-discovery); vendor the upstream original under `vendor/`; remove
  dependence on the global-path fork.
- Template manifest: `AGENTS.md`, `opencode.json`, `.opencode/` (constitution,
  CHARTER, ROADMAP, DECISIONS, agents, commands, plugin, `worktree.jsonc`,
  `package.json`), `docs/validation.md`.
- Setup script (`scripts/init-harness.sh` or a command): copies the manifest,
  parameterizes project name, model routing (see Parked), platform notes,
  permission rules.
- Adaptation doc (`docs/portability.md`): swap `sandbox/` for your own
  project, re-run scenarios 1–11, tune permissions, opt out of
  `default_agent`.
- Copyability blockers to clear: plugin at global path; git-ignored plugin
  deps (document the install step); sandbox is repo-specific (keep as the
  swappable demo); Termux-vs-desktop notes marked adaptive (plugin spawns no
  terminals, so it is platform-neutral); `default_agent: lead` stays opt-out.
- Exit criteria: fresh empty directory + restart → agents cite the
  constitution, `/feature` + `/ship` route through `lead`, worktree tools work
  with no terminal spawn, scenarios 1–12 pass against a small substitute
  project.

### R4 detail — permission hardening

- `lead`: orchestration by capability, not just prompt. Investigate denying
  `edit`; preserve `task`, repo inspection, git state/history, worktree
  orchestration, merge/conflict integration; allow only trivial integration
  fixes.
- `coder`: review blacklist gaps for destructive git/filesystem ops; consider
  positive capabilities over an ever-growing blacklist. Preserve source
  editing, test/lint/typecheck runs, dependency installs, routine commits.
  Keep denying push, force push, hard reset, clean, branch delete.
- Document hard gates (mechanically enforced permissions: push, destructive
  git, publish, `rm -rf`) vs judgment gates (lead must recognize and stop:
  architecture changes, big dependencies, security/auth, production
  migrations, scope deviations).

### R5 detail — state machine

States: Understand → Inspect → Plan → Delegate → Implement → Verify →
Review → Fix → Re-verify → Document → Commit → Report. Invariants: planning
modifies no source; implementation happens through `coder`; reviewer modifies
no source; red tests are never reported done; `NEEDS FIXES` goes back to
`coder`, never straight to commit; commit reaches push only via explicit user
approval. Review loop is explicit: APPROVE → DOCUMENT, or NEEDS FIXES →
CODER → VERIFY → REVIEW.

### R6 detail — parallelism

`planner` marks independent tasks and their dependencies (task DAG: e.g. API
+ UI in parallel, tests after both); never parallelize tasks sharing
assumptions/files in conflicting ways. Worktree invariants: one independent
task → one worktree; one `coder` → one worktree; worktree merged/applied
before completion; abandoned worktrees safely garbage-collected; conflicts
preserve both sides until explicitly resolved.

### R7 detail — reviewer independence

Reviewer receives the original objective, relevant constraints, the resulting
diff, and surrounding context — but NOT the coder's explanation before its
independent verdict (coder report arrives afterward as supplementary
evidence). Output contract: verdict APPROVE / NEEDS FIXES; Critical /
Should-fix / Nits with `file:line`; verification performed; recommendation.

### R8 detail — validation hardening

Every harness behavior change adds a regression scenario to
`docs/validation.md`. Add coverage for permission boundaries, state-transition
invariants, parallel-task dependencies, and reviewer findings being
unbypassable. Portability tests ride with R3's exit criteria.

## Parked (blocked, not forgotten)

- **Per-agent model pins** — blocked until providers are connected
  (`/connect`). Then set static `model:` per agent; no dynamic router
  (see "Explicitly not approved"):

  | Agent | Tier |
  |---|---|
  | `planner` | Strongest reasoning |
  | `coder` | Strong coding |
  | `lead` | Global default (`model` in `opencode.json`) |
  | `reviewer` | Second provider / independent model |
  | `researcher` | Fast / cheap (global `small_model`) |
  | `explore` (built-in) | Inherits |

  Reasoning-effort variants may be set per agent where the model supports them.

## Proposed

None right now. Add ideas here with a one-line why; human approval moves them
to Approved.

## Done

| # | Feature | Date |
|---|---|---|
| — | Phases 0–4.5: scaffold, constitution, agent team, commands, sandbox validation S1–S8, worktree fork + gap fixes S9–S11 | 2026-08-15 |
| — | Delegation-first prompt text (`lead.md`, constitution §3, command rewrites, subagent report contracts) | 2026-08-15 |
| — | Human-readable docs + project memory files (README rewrite, CHARTER, ROADMAP, DECISIONS, constitution §5) | 2026-09-20 |
| — | `PLAN.md` / `TODO.md` retired: all transferable detail migrated here; files deleted | 2026-09-20 |

## Explicitly not approved

These have been considered and rejected. Don't re-propose without a new
`DECISIONS.md` entry and human sign-off.

- Global promotion to `~/.config/opencode/` (replaced by the copyable-template goal).
- Dynamic model routing plugin (static per-agent models suffice).
- Technology-specific agents (roles stay functional).
- Custom `explorer` agent to replace built-in `explore` (idea only).
- Treating the sandbox thermostat as a real product.
- A separate `CHANGELOG.md` (git history + `DECISIONS.md` serve as the log).

## How to change this file

1. Add the idea under "Proposed" with a one-line why.
2. Human approves → move it to "Approved" with detail checklist.
3. Done → move it to "Done" with a date. Never delete — history matters.
