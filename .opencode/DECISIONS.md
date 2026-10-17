# Decisions

> Past decisions live here. **Do not relitigate them** in plans, reviews, or
> new work. If you believe one is wrong, add a *new* dated entry superseding
> it and get human approval — never silently rewrite or ignore an old one.

## Active decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-08-15 | New primary agent `lead`; built-in `build` stays as escape hatch. | Don't hijack or override opencode's default; keep a way out. |
| D2 | 2026-08-15 | Project-scoped harness first; copyable template only after validation. Never promote to global config. | Keeps it opt-in per workspace; each copy diverges freely; deletable cleanly. |
| D3 | 2026-08-15 | No provider/model pins yet — all agents inherit defaults; static per-agent routing table filled in after `/connect`. | Providers unconfirmed; static routing suffices. |
| D4 | 2026-08-15 | `ask` on **all** `git push*` (bare push included); `ask` on destructive git (`reset --hard`, `branch -D`, `clean -f`, force push), `rm -rf*`, `npm publish*`. | A bare `git push` pushes upstream and would bypass branch-pattern gates. |
| D5 | 2026-08-15 | No dynamic model routing plugin (Phase 6 removed). | Dedicated agents with static models are enough; less machinery. |
| D6 | 2026-08-15 | No "read AGENTS.md" instructions in agent prompts. | opencode auto-injects `AGENTS.md` into every session incl. subagents; prompts rely on the injected constitution instead. |
| D7 | 2026-08-15 | Fork the worktree plugin; agent-centric, **no terminals spawned** — work via bash/`worktree_apply`. Adds `worktree_apply` (merge/overwrite + conflict report), stale-worktree GC, `worktree_gc`, `worktree_resolve_conflicts`, `deleteBranch` auto/always/never. | Termux can't spawn desktop terminals; merge-back was the highest-value gap; abandoned worktrees must not accumulate. |
| D8 | 2026-08-15 | Constitution moved from `AGENTS.md` to `.opencode/constitution.md`, injected via `instructions` in `opencode.json`. `AGENTS.md` = workspace notes only. | Skills load on demand; the constitution must be unconditionally present in every agent's context. |
| D9 | 2026-08-15 | Delegation-first: lead orchestrates, never implements features (only trivial integration fixes). Subagents never delegate — lead is the only delegator (flat, depth 1). | Preserves lead's context as coordination budget; keeps the tree flat; enables parallel worktrees. |
| D10 | 2026-08-15 | Sandbox uses stdlib `unittest` (`python3 -m unittest discover -s sandbox`); pytest not installed on this box. No external deps in sandbox, ever. | Zero-install, reproducible validation on Termux. |
| D11 | 2026-08-15 | Phase 5 re-scoped: copyable template, not global promotion (D2 reinforced). | Global promotion would mandate `lead` for every project on the machine. |
| D12 | 2026-09-20 | Human-readable docs + long-term memory files: simplified README with mermaid workflows; new `.opencode/CHARTER.md` (product intent), `.opencode/ROADMAP.md` (only approved-features list), `.opencode/DECISIONS.md` (this log). | README was maintainer-verbose; no durable memory existed for what the harness-built projects may/may not become. |
| D13 | 2026-09-20 | `PLAN.md` / `TODO.md` retired and deleted. CHARTER + ROADMAP (+ constitution §5) are the sole project memory; all transferable detail (model-routing table, Phase 4.6/5 specifics, permission/state-machine/parallelism/reviewer/validation hardening) migrated into ROADMAP items and checklists. | Two authorities drift; one stays true. Per explicit user direction. |

## How to record a new decision

Append a row (never edit an old one): number, date (UTC), the decision in one
line, and the reason. If it supersedes an older entry, say so in the Why
column (e.g. "Supersedes D4: …") and mark the old row ~~struck through~~ —
don't delete it.
