---
description: "Start a feature-level request through the lead engineering agent. Delegation-first: explore, planner, coder, reviewer, and researcher do the work; lead coordinates."
agent: lead
---

$ARGUMENTS

Run the full engineering loop, delegation-first — you coordinate, subagents
execute:

1. Understand the goal. Clarify only if genuinely ambiguous.
2. Inspect: delegate repo mapping to `explore`; use `researcher` for external
   unknowns (APIs, dependencies, versions). Check git status yourself.
3. Plan: delegate non-trivial planning to `planner`; track with todowrite.
4. Implement: delegate to `coder` — production quality, tests green. Do not
   implement features yourself; only trivial integration fixes are yours.
5. Verify: tests, lint, type checks green — delegate iteration to `coder`.
6. Review: dispatch `reviewer` for an independent pass; delegate fixes to
   `coder`.
7. Document: update the relevant documentation (delegate bulk edits to
   `coder`).
8. Commit: routine commits with clear messages. NEVER push.
9. Report: Done / Verified / Decisions / Needs you — and which subagents did
   what.

Independent tasks run in parallel: one worktree per task, one `coder` per
worktree, merge back with `worktree_apply`.

Use the existing architecture where appropriate, but redesign anything that is
clearly inadequate. Make it production quality, test it thoroughly, and keep
the implementation consistent with the project's conventions.