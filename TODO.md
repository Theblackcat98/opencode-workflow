# OpenCode Workflow — Architecture & Hardening TODO

## P0 — Release / correctness blockers

- [ ] Verify Scenario 12 after fully restarting OpenCode
  - Confirm `instructions: [".opencode/constitution.md"]` is actually injected into:
    - [ ] `lead`
    - [ ] `planner`
    - [ ] built-in `explore`
  - Ask each agent to recite the constitution without reading the file.
  - Confirm `AGENTS.md` contains only workspace-specific instructions.
  - Mark Scenario 12 PASS only after live verification.
  - This should remain a Phase 5 release blocker.

- [ ] Reconcile `PLAN.md` with the actual repository state
  - Phase 4.6 is described as planned/not started even though the delegation-first
    commands and workflow are already implemented.
  - Update phase statuses to reflect the actual implementation.
  - Separate historical implementation decisions from the current roadmap.
  - Ensure README, PLAN, validation docs, and actual configuration agree.

## P1 — Enforce the architecture more mechanically

- [ ] Tighten `lead` capabilities
  - Goal: make `lead` an orchestrator in capability, not merely by instruction.
  - Investigate whether `edit` can be denied/restricted for `lead`.
  - Preserve access to:
    - [ ] `task`
    - [ ] repository inspection
    - [ ] git state/history
    - [ ] worktree orchestration
    - [ ] merge/conflict integration
  - Allow only narrowly defined integration fixes if possible.
  - Prevent normal feature implementation from occurring directly in `lead`.

- [ ] Tighten `coder` destructive-operation permissions
  - Review the current blacklist approach.
  - Identify destructive git/filesystem operations that are not currently blocked.
  - Consider whether capabilities can be expressed positively rather than by
    continually expanding a command blacklist.
  - Preserve:
    - [ ] source editing
    - [ ] test execution
    - [ ] lint/typecheck
    - [ ] dependency installation when appropriate
    - [ ] routine commits
  - Continue denying:
    - [ ] push
    - [ ] force push
    - [ ] destructive repository operations
    - [ ] unnecessary destructive filesystem operations

- [ ] Formalize "hard permission gates" vs "judgment gates"
  - Hard gates = mechanically enforceable permissions.
  - Judgment gates = decisions the lead must recognize and stop for.
  - Document the distinction explicitly.
  - Example hard gates:
    - [ ] git push
    - [ ] force push
    - [ ] destructive git
    - [ ] publish
    - [ ] destructive filesystem operations
  - Example judgment gates:
    - [ ] major architecture changes
    - [ ] significant dependencies
    - [ ] security/auth architecture
    - [ ] production migrations
    - [ ] substantial scope deviations

## P1 — Make the workflow a state machine

- [ ] Formalize the engineering workflow as explicit states
  - [ ] Understand
  - [ ] Inspect
  - [ ] Plan
  - [ ] Delegate
  - [ ] Implement
  - [ ] Verify
  - [ ] Review
  - [ ] Fix
  - [ ] Re-verify
  - [ ] Document
  - [ ] Commit
  - [ ] Report

- [ ] Define invariants for each state
  - Planning cannot modify source code.
  - Implementation happens through `coder`.
  - Reviewer cannot modify source.
  - Failed verification cannot be reported as complete.
  - `needs fixes` review cannot transition directly to commit.
  - Commit cannot transition to push without explicit user approval.

- [ ] Make the review loop explicit
  - REVIEW → APPROVE → DOCUMENT
  - REVIEW → NEEDS FIXES → CODER → VERIFY → REVIEW
  - Eliminate any possible path from `NEEDS FIXES` directly to COMMIT.

## P1 — Improve parallel execution

- [ ] Make parallelism an explicit planning decision
  - Planner should identify independent tasks.
  - Represent dependencies between tasks.
  - Avoid parallelizing tasks that modify shared assumptions/files in conflicting ways.

- [ ] Introduce a task dependency DAG concept
  - Example:
    - Task A: API
    - Task B: UI
    - Task C: tests depending on A+B
  - Run A/B in parallel.
  - Run C only after A+B complete.

- [ ] Define worktree lifecycle invariants
  - One independent task → one worktree.
  - One implementation agent → one worktree.
  - Worktree must be merged/applied before completion.
  - Failed/abandoned worktrees must be safely garbage-collected.
  - Conflict handling must preserve both sides until explicitly resolved.

## P1 — Strengthen reviewer independence

- [ ] Make reviewer evaluate the artifact rather than the coder's reasoning
  - Reviewer should receive:
    - [ ] original objective
    - [ ] relevant constraints
    - [ ] resulting diff
    - [ ] surrounding code/context
  - Do not bias the reviewer with the coder's explanation before the independent verdict.
  - Coder report can be supplied afterward as supplementary evidence.

- [ ] Define reviewer output contract
  - [ ] Verdict: APPROVE / NEEDS FIXES
  - [ ] Critical findings
  - [ ] Should-fix findings
  - [ ] Nits
  - [ ] Verification performed
  - [ ] Recommendation

## P2 — Improve agent-role completeness

- [ ] Consider creating a custom `explorer` agent
  - Replace/reduce dependence on OpenCode's built-in `explore`.
  - Make the exploration role explicitly read-only.
  - Define its output contract.
  - Prevent it from drifting into architecture decisions or implementation.
  - Standardize repository findings with file/line references.

- [ ] Keep the current agent decomposition
  - Do NOT add technology-specific agents prematurely.
  - Preserve functional roles:
    - [ ] Lead
    - [ ] Explorer
    - [ ] Researcher
    - [ ] Planner
    - [ ] Coder
    - [ ] Reviewer

## P2 — Improve documentation architecture

- [ ] Separate current roadmap from historical decisions
  - Consider:
    - [ ] `PLAN.md` = current roadmap
    - [ ] `DECISIONS.md` or `docs/decisions/` = architectural decisions
    - [ ] `CHANGELOG.md` = implementation history

- [ ] Document constitution loading semantics
  - Clarify:
    - [ ] what is automatically injected
    - [ ] what agents must treat as authoritative
    - [ ] when agents need to explicitly read files
    - [ ] distinction between constitution and `AGENTS.md`

- [ ] Explicitly document capability vs behavioral policy
  - Constitution = behavioral contract.
  - Permissions = capability/safety enforcement.
  - Commands = workflow entry points.
  - Worktrees = isolation primitive.

## P2 — Improve reporting / observability

- [ ] Standardize final task reports around:
  - [ ] Done
  - [ ] Verified
  - [ ] Delegation
  - [ ] Decisions
  - [ ] Needs you

- [ ] Record which agents performed which stages
  - Example:
    - explore → repository mapping
    - researcher → external research
    - planner → implementation plan
    - coder → implementation
    - reviewer → independent review

- [ ] Preserve enough delegation information to diagnose agent failures later.

## P3 — Validation improvements

- [ ] Keep validation scenario suite as a first-class part of the project.
- [ ] Add regression scenarios whenever harness behavior changes.
- [ ] Add tests for permission boundaries where practical.
- [ ] Add tests for state-transition invariants.
- [ ] Add tests for parallel-task dependency handling.
- [ ] Add tests ensuring reviewer failures cannot be bypassed.
- [ ] Add portability tests before Phase 5 packaging.

## P3 — Phase 5 packaging

- [ ] Move the worktree plugin into the repository/package
  - `.opencode/plugin/`
  - Remove dependence on the user's global plugin fork.

- [ ] Make the repository genuinely copyable into a new project.
- [ ] Ensure project-specific `AGENTS.md` remains separate from harness policy.
- [ ] Ensure all required agents/commands/plugins/config are self-contained.
- [ ] Validate the packaged template in a fresh repository.
- [ ] Validate that no hidden global configuration is required.

## Architectural principle to preserve

- [ ] User owns WHAT and WHY.
- [ ] Harness owns HOW.
- [ ] Lead coordinates.
- [ ] Specialists execute bounded responsibilities.
- [ ] Permissions enforce capabilities.
- [ ] Review is independent.
- [ ] Parallel work is isolated.
- [ ] Verification gates completion.
- [ ] Human approval is reserved for consequential actions.
- [ ] The system should become more deterministic through explicit state,
      capabilities, and invariants rather than more prompts or more agents.