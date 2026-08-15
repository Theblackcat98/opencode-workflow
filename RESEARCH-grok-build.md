# Research: Grok Build (xai-org/grok-build)

How SpaceXAI's open-source harness handles **parallel tasks, worktrees, and
subagents** — and what we can adopt for the opencode workflow in `PLAN.md`.

- **Repo:** https://github.com/xai-org/grok-build (Apache-2.0, Rust monorepo)
- **Product:** `grok` CLI — TUI + agent runtime; headless (`-p`) and ACP modes
- **Open-sourced:** 2026-07-15 (synced from SpaceXAI monorepo, `SOURCE_REV`)
- **Relevant crates:** `xai-grok-tools` (tools incl. `task`), `xai-grok-shell`
  (agent runtime, subagent coordinator), `xai-grok-workspace` (worktree ops),
  `xai-fast-worktree` (fast CoW worktree creation), `xai-grok-subagent-resolution`
  (personas/roles/overrides)

---

## 1. Subagents

### 1.1 Spawn model

Subagents are **independent child sessions** — each with its own context
window — spawned by the main agent via the `spawn_subagent` tool
(`crates/codegen/xai-grok-tools/src/implementations/grok_build/task/`).
The child reports a summary back to the parent on completion.

Key parameters (from `16-subagents.md` user guide and `task/types.rs`):

| Param | Meaning |
|---|---|
| `prompt` | Full task prompt for the child |
| `description` | 3–5 word label shown in the TUI |
| `subagent_type` | `general-purpose` (default), `explore`, `plan` — or custom/plugin agents |
| `run_in_background` | `false` = parent blocks; `true` = return immediately with a subagent ID |
| `capability_mode` | Coarse tool filter: `read-only`, `read-write`, `execute`, `all` |
| `isolation` | `none` (shared workspace, default) or `worktree` (isolated git checkout) |
| `resume_from` | Continue a completed subagent's conversation (inherits transcript, tool state, model; system prompt re-rendered) |
| `cwd` | Working dir (mutually exclusive with `isolation: worktree`) |
| `model` | Explicit model override, validated before spawn (`TaskModelValidator`) |

### 1.2 Agent types vs personas

Two orthogonal layers:

- **Agents** (`.grok/agents/*.md`, `~/.grok/agents/*.md`) — define the whole
  session: model, tools, prompt mode, system prompt. Built-ins: `grok-build`,
  `explore`, `plan`. Runtime resolution in `xai-grok-subagent-resolution`
  (persona/role/spawn override merging).
- **Personas** (`config.toml [subagents.personas]` or `.grok/personas/*.toml`)
  — behavioral overlay injected as a `<system-reminder>` into the child's
  conversation: tone, output format, task focus. Do NOT change model/tools.
  Personas can declare **input/output contracts** (files) so one persona's
  output file chains into the next persona's input. They can also override
  `model`, `reasoning_effort`, and `default_isolation` per persona.

### 1.3 Capability modes (the tool filter we should steal)

One enum instead of per-agent permission matrices:

| Mode | Read | Write | Execute |
|---|---|---|---|
| `read-only` | yes | no | no |
| `read-write` | yes | yes | no |
| `execute` | yes | no | yes |
| `all` | yes | yes | yes |

`explore` and `plan` types ship read-only; `general-purpose` ships everything.

### 1.4 Depth limit

**Maximum nesting depth is one.** Only the top-level session spawns subagents;
a child calling `spawn_subagent` fails with a depth-limit error
(`SubagentDepthCounter`, `MaxSubagentDepth`). Keeps the tree flat, prevents
runaway spawning. (This differs from opencode, which allows arbitrary nesting
via the `task` tool.)

### 1.5 Context inheritance

- `resume_from`: multi-stage pipelines — spawn research, then spawn a second
  subagent with `resume_from` = first child's ID, inheriting its full context.
- **MCP inheritance**: children inherit the parent's connected MCP servers by
  default; `mcpInheritance: all | none | named:[...] | except:[...]` in agent
  frontmatter controls it.
- Subagents have their own **subagent prompt template**
  (`xai-grok-agent/templates/subagent_prompt.md`): scoped, "do not broaden
  scope", parallelize independent tool calls, project-instruction scoping
  rules for `AGENTS.md` trees.

### 1.6 Coordinator runtime

`xai-grok-shell/src/agent/subagent/` — `SubagentCoordinator` is an actor
owning every spawn/query/cancel lifecycle transition; each child runs in its
own lane (`attempt_runner.rs`, `handle_request.rs`). Key properties:

- **Background subagents are not fire-and-forget**: completion auto-surfaces
  to the model as a buffered reminder/auto-wake (`surface_completion`).
- Cancelling a prompt cancels every child it spawned, without touching
  background children from earlier turns (`parent_prompt_id` scoping).
- TUI shows lifecycle blocks in scrollback, a Tasks pane (`Ctrl+G`), and a
  fullscreen framed child transcript.

---

## 2. Parallel tasks

### 2.1 The pattern (best-of-n skill)

The in-tree `best-of-n` skill documents the canonical parallel pattern
(`crates/codegen/xai-grok-shell/skills/best-of-n/SKILL.md` — "Parallel
Implementation Tournament"):

1. **Spawn N subagents in a single message (parallel tool calls)**, each with
   `subagent_type: "general-purpose"`, `isolation: "worktree"`,
   `run_in_background: true`, and a description like `"Candidate 1"`.
2. **Wait for all** using `get_task_output` with `block: true`, or
   `wait_tasks` with `mode: "wait_all"`.
3. **Evaluate** the candidates against criteria.
4. **Apply the winner** from its worktree to the main workspace; review and fix.
5. Reply `WINNER: <id>`.

### 2.2 Wait/collect tools

- `get_task_output` (aliases: `get_command_or_subagent_output`) — fetch a
  single result; with `task_ids` + positive `timeout_ms` supports **wait-all**
  across multiple background tasks (`MAX_MULTI_WAIT_IDS` cap).
- `wait_tasks` — `mode: "wait_all"` (block until all complete) or
  `mode: "wait_any"` (first completion wins; event-driven). Kept as a thin
  compatibility alias; multi-id waits route through the unified get tool.
- `kill_task` — cancel a background subagent/command.

### 2.3 Concurrency model

- The session actor serializes the **main turn**; subagents and monitors run
  in **parallel lanes** — the TUI event loop never blocks on the model
  (`xai-grok-sampler` owns sampling concurrency).
- Per-type model routing: `[subagents.models] explore = "grok-build"` routes a
  subagent type to a different model; explicit spawn-time `model` override
  wins, then role default, then persona default, then parent session.
- Parallel tool calls inside one response are encouraged by the subagent
  prompt template ("Parallelize independent tool calls in a single response").

---

## 3. Worktrees

### 3.1 Two entry points

1. **Interactive/CLI sessions**: `grok --worktree=my-feature "prompt"`,
   `Ctrl+W` in a git repo, or `/fork` to copy the current conversation into a
   parallel session (e.g. `/fork try the async approach`). Dashboard
   (`/dashboard`, `Ctrl+\`) shows all sessions grouped by state.
2. **Subagent isolation**: `isolation: worktree` on `spawn_subagent` — the
   child works in its own checkout; its result includes the worktree path.
   Changes stay isolated until merged back via the apply operation.

### 3.2 xai-fast-worktree (`crates/codegen/xai-fast-worktree/`)

The interesting engineering. Worktree creation pipeline:

1. `git worktree add --no-checkout` — instant metadata (no file copy).
2. **Parallel CoW file cloning** with hash-based sharding across worker
   threads (`copy/engine.rs`, `copy/worker.rs`, `copy/shard.rs`); parallelism
   defaults to `num_cpus::get()` (`WorktreePlan.effective_parallelism`).
3. **Dirty file replication** — `WorktreeCopyMode::Dirty` (default) copies
   uncommitted files and skips large untracked dirs; `Clean` copies only
   committed HEAD files. Optional ignored-file copying.
4. **BTRFS snapshots on Linux** — O(1) subvolume snapshots; a
   `BtrfsDelegate` trait lets sandboxed callers (no `CAP_SYS_ADMIN`)
   delegate snapshot/mount ops to a privileged process over IPC.
5. **OverlayFS option** — overlay snapshots (`overlay/detect.rs`) where the
   filesystem supports it; falls back to plain git checkout on FUSE mounts.
6. **Worktree pools** (`sync.rs`) — pre-created, pre-copied worktree pools
   that sync API hands out instantly, avoiding per-spawn copy latency;
   `count_tracked_files()` decides whether a repo is large enough to benefit.
7. **Metadata registry** — SQLite DB (`db/schema.rs`) tracking worktrees,
   kinds, statuses; auto-GC (`auto_gc.rs`) with max-age expiry, rebuild and
   orphaned-snapshot cleanup; CLI binary `bin/cli.rs`.

`WorktreeType`: `Linked` (default; `git worktree add --no-checkout` + CoW
copy), `Standalone` (independent `.git/`), `Git` (plain full checkout).
Resident in `xai-grok-workspace/src/worktree/mod.rs` — create/list/remove/
apply RPCs.

### 3.3 Merge-back (apply)

`workspace.apply_worktree` (`xai-grok-workspace-types/src/rpc/worktree.rs`)
with `ApplyMode`:

- `Overwrite` (default) — copy child's changes over the main tree.
- `Merge` — merge child worktree changes into the parent working directory,
  surfacing conflicts (`FileConflict`, `CopiedChangesSummary`,
  `DirtyStateSummary`).

The worktree lifecycle is fully session-aware: `resume_session_in_worktree`,
`rehydrate_session_in_worktree` keep session persistence, auth, and registry
in sync with the branch checkout.

---

## 4. What we can adopt for the opencode workflow

| Grok Build concept | Our opencode equivalent today | Gap / opportunity |
|---|---|---|
| `isolation: worktree` on spawn | Worktree plugin (`worktree_create`/`worktree_delete` tools, session fork) | Grok's isolation is **one parameter on the task call**, not a separate tool the agent must remember. Could be emulated by prompt convention: `lead` calls `worktree_create` before delegating, or a small plugin wraps the `task` tool |
| Fast CoW worktree creation | Plain `git worktree add` in plugin | On Termux/slow storage: adopt dirty-file copy + parallelism config; btrfs/overlay are Linux-only and out of scope on Android |
| `ApplyMode::Overwrite / Merge` with conflict report | Plugin deletes worktree; no apply/merge-back tool | **Highest-value gap.** A `worktree_apply` tool that merges child changes into the main checkout with a conflict summary would complete the loop (plugin currently relies on git add/commit + manual merge) |
| Background subagents + wait-all (`run_in_background`, `get_task_output task_ids + timeout`, `wait_all`) | opencode `task` tool supports parallel spawn; no built-in wait-all collector | opencode's `task` supports background runs; verify a wait/collect convention in the `lead` prompt (delegate in parallel, then collect results) |
| Capability modes (`read-only`/`read-write`/`execute`/`all`) | Per-agent permission rules per tool | Conceptually identical; our agents already model this via `permission:` (planner/reviewer = read-only, coder = all) |
| Personas (behavioral overlay + IO contracts) | Separate subagents | Could be layered onto one subagent via prompt composition; opencode's per-agent model/temp already covers persona overrides. Low priority |
| Depth limit = 1 | opencode allows arbitrary task nesting | Consider a `lead` prompt rule: "never delegate from a subagent" to keep the tree flat |
| `[subagents.models]` per-type routing | Per-agent `model:` in frontmatter | Already planned in `PLAN.md` §5 |
| Worktree pools + SQLite registry + auto-GC | Plugin's SQLite state (`worktree/state.ts`) tracks sessions | Pooling is overkill for personal use; the plugin's registry is sufficient. Auto-GC of stale worktrees is worth stealing |
| Tasks pane / live subagent blocks | opencode session tree (child sessions) | Cosmetic TUI difference; not a blocker |

### Recommended additions to `PLAN.md`

1. **`worktree_apply` tool** (plugin): merge child worktree → main checkout,
   report conflicts/dirty summary (mirrors `ApplyMode::Overwrite/Merge`).
2. **Parallel-delegation convention** in `lead.md`: spawn independent tasks in
   parallel, collect via wait-all semantics, apply worktree changes back before
   final report.
3. **Flat delegation rule**: subagents never spawn subagents (depth 1), like
   grok's hard limit.
4. **Stale-worktree GC** in the worktree plugin: periodic cleanup of
   abandoned worktrees (mirrors `auto_gc.rs`).
5. Validate whether opencode's `task` tool result surfaces a worktree path /
   child cwd — needed to implement apply-back reliably on Termux.

---

## 5. Sources

- Repo: https://github.com/xai-org/grok-build
- Subagents user guide: `crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md`
- Worktrees tutorial: `crates/codegen/xai-grok-pager/docs/tutorial/06-worktrees.md`
- Task tool runtime: `crates/codegen/xai-grok-tools/src/implementations/grok_build/task/`
  (`types.rs`, `coordinator.rs`, `backend.rs`, `admission.rs`)
- Wait/collect: `crates/codegen/xai-grok-tools/src/implementations/grok_build/task_output/`
  (`mod.rs`, `wait_tasks.rs`)
- Fast worktrees: `crates/codegen/xai-fast-worktree/` (`lib.rs`, `api.rs`,
  `src/worktree/plan.rs`, `src/copy/*`, `src/btrfs/*`, `src/overlay/*`, `src/sync.rs`)
- Worktree lifecycle RPCs: `crates/codegen/xai-grok-workspace/src/worktree/mod.rs`,
  `crates/codegen/xai-grok-workspace-types/src/rpc/worktree.rs`
- Subagent prompt template: `crates/codegen/xai-grok-agent/templates/subagent_prompt.md`
- Subagent resolution: `crates/codegen/xai-grok-subagent-resolution/`
- Best-of-n skill (parallel tournament pattern): `crates/codegen/xai-grok-shell/skills/best-of-n/SKILL.md`
- Analysis date: 2026-08-15 (tree at commit `main`, 30 commits)