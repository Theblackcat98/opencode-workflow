# Project Charter

> Read this before building anything. If what you're about to do contradicts
> this file, stop and talk to the human first.

This charter defines what the project **is** and **is not**, so future work
(and future agents) don't suffer scope creep. It is the long-term memory of
*product intent*. `ROADMAP.md` says what's approved; `DECISIONS.md` says what
was already decided; this file says what the project *is*.

## What this project is

- **An engineering harness for opencode**: a small team of agents (lead,
  planner, coder, reviewer, researcher) plus three commands (`/feature`,
  `/ship`, `/status`) and a worktree plugin for parallel work.
- **A staging ground that becomes a copyable template.** Everything here is
  exercised against `sandbox/` first, then packaged so any folder/workspace
  can adopt it. Each workspace owns its copy and may diverge freely.
- **A delegation-first system.** The human says *what + why*; the harness owns
  *how* (inspect → plan → build → verify → review → document → commit). Lead
  coordinates; specialists execute.
- **A safety-gated system.** Routine work runs autonomously; consequential
  actions (push, deploy, destructive git/DB, security/auth, secrets, big
  dependencies, architecture changes) always stop for human approval.

## What this project is not

- **Not a product app.** `sandbox/` (the thermostat demo) is a training
  surface, not the product. Never "improve" the sandbox for its own sake —
  it exists only to validate the harness.
- **Not a global opencode install.** Nothing here is promoted to
  `~/.config/opencode/`. The harness travels *with the repo*, opt-in per
  workspace, deletable with zero side effects elsewhere.
- **Not a model router.** Per-agent models stay static (set after `/connect`);
  there is no dynamic routing plugin, no benchmarking layer, no cost optimizer.
- **Not a CI/CD, deployment, or monitoring system.** It builds, tests, reviews,
  and commits locally. Push/deploy remain explicit human decisions.
- **Not a framework for technology-specific agents.** Roles stay functional
  (lead / explore / research / plan / code / review). No per-language or
  per-framework agents.

## Who owns what (one-line version)

- **Human:** what + why — vision, scope, priorities, final approval of
  consequential decisions.
- **Harness:** how — architecture understanding, planning, implementation,
  tests, review, docs, routine commits.

Full contract: `.opencode/constitution.md`.

## When this template is copied into a new project

This charter **must be rewritten** for the new project. Keep this file's shape
(is / is not / owners) but replace the content above with the new product's
identity. `ROADMAP.md` and `DECISIONS.md` travel along as the new project's
starting memory — archive entries that no longer apply instead of deleting
them, so history stays traceable.
