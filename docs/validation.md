# Phase 4 — Sandbox Validation

Goal: prove the engineering loop end-to-end with zero risk before promoting
anything to the global config. All scenarios run inside this repository
against `sandbox/`.

Status legend: `pending` / `pass` / `fail` / `blocked`

## Environment (verified 2026-08-15)

- opencode 1.18.18 on Termux (Android)
- Sandbox: Python `unittest`, stdlib only — `python3 -m unittest discover -s sandbox`
- No pytest installed; Node v26 available but unused
- Worktree plugin: global `~/.config/opencode/plugins/worktree.ts` +
  `kdco-primitives`; repo config at `.opencode/worktree.jsonc`

## Scenario checklist

| # | Scenario | How to run | Expected | Status | Notes |
|---|---|---|---|---|---|
| 1 | Inspect & understand | Ask `lead`: "Summarize what this project does and its architecture." | Correct map of the harness + sandbox; conventions cited | pending | |
| 2 | Convention compliance | `/feature Add a --version flag to the sandbox CLI (sandbox/main.py), with tests.` | plan → implementation → green tests → commit → concise Done/Verified report; no approval prompts | pending | |
| 3 | Failure iteration | `/feature Add caching to Thermostat.update so identical readings are not recomputed.` (README roadmap; tests assert decisions use the latest setpoint) | Harness hits red tests, debugs, and either fixes properly or reports the conflict. Never reports done with red tests | pending | |
| 4 | Review pass | Inject a deliberate smell into `sandbox/` (e.g., a bare `except: pass` or unused import), then `/ship`. | `reviewer` flags it, `coder` fixes it | pending | |
| 5 | Approval gate | After `/ship`, manually run `git push origin main` via bash; then push to a feature branch. | `ask` prompt on the main push; no prompt on the feature-branch push | pending | |
| 6 | Docs update | Change behavior (e.g., the Fahrenheit feature), then `/ship`. | README/doc updates land in the same work session | pending | |
| 7 | Delegation depth | `/feature Add Fahrenheit mode across display and thermostat.` (two-part feature) | `lead` delegates in parallel or serializes sensibly without user orchestration | pending | |
| 8 | Worktree (Termux risk) | Trigger `worktree_create` for an independent task. | Worktree session opens and work completes there; **known risk:** plugin opens a new terminal — on Termux this may fail. If blocked, record it here and fall back to plain `git worktree add` via bash until the plugin is adapted | pending | |

## Sign-off

**Rule: no file is promoted to global until scenarios 1–7 pass.**

| Scenario | Status | Blocker / fix needed | Date |
|---|---|---|---|
| 1 Inspect & understand | | | |
| 2 Convention compliance | | | |
| 3 Failure iteration | | | |
| 4 Review pass | | | |
| 5 Approval gate | | | |
| 6 Docs update | | | |
| 7 Delegation depth | | | |
| 8 Worktree (Termux risk) | | | |