---
description: "Close out the current work: verify, review, document, commit. Delegates to explore (state check), reviewer (independent pass), coder (fixes). Does not push."
agent: lead
---

Close out the current work, delegation-first:

1. Worktrees: `worktree_list`; apply any pending worktree back with
   `worktree_apply` (merge); resolve conflicts.
2. State check: delegate to `explore` — uncommitted changes, docs that should
   have been updated, anything left behind.
3. Verify: run the full test suite, lint, and type checks; delegate failures
   to `coder`.
4. Review: dispatch `reviewer` for an independent pass on the current diff;
   delegate Critical/Should-fix findings to `coder`; re-verify.
5. Document: update the relevant documentation (delegate bulk edits to
   `coder`).
6. Commit: clear routine commits. NEVER push.
7. Report: Done / Verified / Decisions / Needs you — and which subagents did
   what.