---
name: setup-pstack
description: Orient a new user to pstack in opencode — reasoning budget guidance, which models this install offers, and the optional verification-skill flow. Use for "set up pstack", "configure pstack", "pstack budget", or getting started with pstack.
---

# Setup pstack

Environment orientation for a new pstack user in opencode. This skill writes no config file: every role runs as a subagent that inherits the session model, so there is nothing per-role to configure.

## 1. Reasoning budget

The whole session moves together. When a task needs deeper reasoning, switch the session to a higher-reasoning variant if the provider offers one; drop to a lighter variant for cheap, well-understood tasks. Prefer a higher-reasoning variant for judgment-heavy work (architecture, cross-cutting refactors, ambiguous bugs) and a lighter one for mechanical edits. If the user names a budget (unlimited / large / medium / small), translate it to the closest variant this install offers and say which one that is.

## 2. Which models this install offers

Check this opencode install's provider config, or run `/models` to list what is available. Switching the session model switches every role with it, since subagents spawned afterwards inherit it. If the user wants a different model for a task, they switch the session model — no per-role mapping exists to update.

## 3. Start working

Once orientation is done, do real work under the **poteto-mode** skill (load via the `skill` tool, or `@poteto-mode`).

## 4. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: ask the user directly in text and wait for the answer — "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with the **create-verification-skill** skill (load via the `skill` tool, or `@create-verification-skill`)." On yes, load it. On no, move on without pushing.
