# Phase 4 — Sandbox Validation

Goal: prove the engineering loop end-to-end with zero risk before promoting
anything to the global config. All scenarios run inside this repository
against `sandbox/`.

Status legend: `pending` / `pass` / `fail` / `blocked` / `needs user` (verifiable only
in a live interactive session) / `pass (fallback)` (scenario met via the documented
fallback path).

## Environment (verified 2026-08-15)

- opencode 1.18.18 on Termux (Android)
- Sandbox: Python `unittest`, stdlib only — `python3 -m unittest discover -s sandbox`
- No pytest installed; Node v26 available but unused
- Worktree plugin: global `~/.config/opencode/plugins/worktree.ts` +
  `kdco-primitives`; repo config at `.opencode/worktree.jsonc`

## Scenario checklist

| # | Scenario | How to run | Expected | Status | Notes |
|---|---|---|---|---|---|
| 1 | Inspect & understand | Ask `lead`: "Summarize what this project does and its architecture." | Correct map of the harness + sandbox; conventions cited | pass | Independent `explore` map matched the lead's map (harness loop, agent team, commands, sandbox modules, both AGENTS.md convention sets cited) |
| 2 | Convention compliance | `/feature Add a --version flag to the sandbox CLI (sandbox/main.py), with tests.` | plan → implementation → green tests → commit → concise Done/Verified report; no approval prompts | pass | `--version` + `VERSION` + 3 CLI tests added; 15/15 green; README updated; committed `f70e93a`; no approval prompts raised |
| 3 | Failure iteration | `/feature Add caching to Thermostat.update so identical readings are not recomputed.` (README roadmap; tests assert decisions use the latest setpoint) | Harness hits red tests, debugs, and either fixes properly or reports the conflict. Never reports done with red tests | pass | coder ran naive memoization → red `test_decision_uses_latest_setpoint` → fixed with single-entry cache + `set_temperature` invalidation + `_decide` seam; 17/17 green; committed `076cc45` |
| 4 | Review pass | Inject a deliberate smell into `sandbox/` (e.g., a bare `except: pass` or unused import), then `/ship`. | `reviewer` flags it, `coder` fixes it | pass | Injected bare `except: pass` (sensor.py) + unused `import math` (display.py); reviewer flagged both (Critical/Should fix); coder reverted both + fixed EOF newline; 17/17 green; committed `9bf26f8` |
| 5 | Approval gate | After `/ship`, manually run `git push origin main` via bash; then push to a feature branch. | `ask` prompt on **all** pushes (main and feature branch), per decision PLAN.md §3.4 | pass | Verified by the user in a live session 2026-08-15: `ask` prompt confirmed on push. Config rules (`opencode.json` + `lead.md`, last-match-wins ordering) verified present |
| 6 | Docs update | Change behavior (e.g., the Fahrenheit feature), then `/ship`. | README/doc updates land in the same work session | pass | README updated in the same session as each feature commit: `--version` usage (S2), caching roadmap removal (S3), Fahrenheit usage + roadmap removal (S7) |
| 7 | Delegation depth | `/feature Add Fahrenheit mode across display and thermostat.` (two-part feature) | `lead` delegates in parallel or serializes sensibly without user orchestration | pass | Full `planner` → `coder` → `reviewer` chain, serialized (shared working tree, interdependent halves, tiny repo). Reviewer caught `setpoint_in` duplicating the F formula in the domain layer; fixed by moving conversion to the display boundary + strict parser errors; 22/22 green; committed `dd09abb` |
| 8 | Worktree (Termux risk) | Trigger `worktree_create` for an independent task. | Worktree created and isolated work completes, then merges back (now via the forked plugin's `worktree_apply`) | pass | Plugin forked and adapted by the user 2026-08-15 (Phase 4.5): **no terminals are spawned** — worktree work happens via bash/`worktree_apply`, which removes the Termux terminal-detection failure entirely. See scenarios 9–11 |

**Correction (2026-08-15):** scenario 5's original "expected" text ("no prompt on the feature-branch push") contradicts locked decision PLAN.md §3.4: **ask on ALL `git push*`**, so a bare `git push` cannot bypass the gate. Expected behavior is an `ask` prompt on every push, feature branch included.

## Sign-off

**Rule: no file is promoted to global until scenarios 1–7 pass.**

| Scenario | Status | Blocker / fix needed | Date |
|---|---|---|---|
| 1 Inspect & understand | pass | none | 2026-08-15 |
| 2 Convention compliance | pass | none | 2026-08-15 |
| 3 Failure iteration | pass | none | 2026-08-15 |
| 4 Review pass | pass | none | 2026-08-15 |
| 5 Approval gate | pass | user-verified live 2026-08-15 (ask prompt confirmed); config rules present | 2026-08-15 |
| 6 Docs update | pass | none | 2026-08-15 |
| 7 Delegation depth | pass | none | 2026-08-15 |
| 8 Worktree (Termux risk) | pass | plugin forked/adapted 2026-08-15 — no terminal spawn (Phase 4.5); see scenarios 9–11 | 2026-08-15 |

**Promotion gate: scenarios 1–7 must pass before any file is promoted to global.**
Scenario 5 is the sole gate-holder: config is in place and verified, but the interactive `ask`
prompt needs a human in a live session (and a configured remote). Scenarios 1–4, 6–7 pass;
8 passes via the documented fallback.