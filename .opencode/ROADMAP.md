# Roadmap

> **This file is the only source of approved features.** If an idea is not
> listed here as approved, it is not approved — do not design, plan, or build
> it. To propose something, add it under "Proposed" and get human approval
> before moving it to "Approved". Detail checklists under each item are part
> of the approval — don't silently drop them.

## Approved — not yet done


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
