# opencode-worktree

> Agent-centric git worktrees for opencode. Create, merge, and clean up isolated worktrees — no terminals spawned, no session forking.

An [OpenCode](https://github.com/sst/opencode) plugin that gives agents first-class git worktree isolation:

- **`worktree_create`** — spin up an isolated worktree on a new branch
- **`worktree_apply`** — merge the worktree's changes back into the main checkout, with conflict reporting
- **`worktree_delete`** — commit a snapshot and remove the worktree (branch cleanup included)
- **`worktree_list`** — see all worktrees, their age, and merge status (reconciled with git)
- **`worktree_gc`** — prune stale worktrees, with a `dryRun` preview
- **`worktree_resolve_conflicts`** — resolve a pending merge as ours/theirs, or abort it

Forked from [kdcokenny/opencode-worktree](https://github.com/kdcokenny/opencode-worktree) with the terminal-spawning machinery (tmux/cmux/platform terminals, session forking, OCX launch context) removed. This fork is **agent-centric**: the agent itself works inside the worktree via the `bash` tool or delegated subagents, then merges back.

## Why This Exists

Isolated work for AI agents is the core of a parallel-delegation workflow. The upstream plugin was built for *humans*: it opened a new terminal with OpenCode running in the worktree. That doesn't fit agentic flows — and on headless/limited environments (like Termux) spawning terminals fails outright.

This version is the other side of that loop: the agent creates a worktree, does isolated work in it, and merges the result back with a conflict summary. It mirrors the `ApplyMode::Overwrite / Merge` semantics of grok-build's `workspace.apply_worktree` (see `RESEARCH-grok-build.md`).

## How It Works

```text
lead agent                      main checkout
    │  worktree_create(branch)        │
    ▼                                 │
worktree on feature/x  ◄── isolated work via bash/task
    │  worktree_apply(branch, merge)  │
    └──────────►  git merge → conflicts reported as file list
    │  worktree_delete(branch)        │
    └──────────►  snapshot commit + git worktree remove
```

1. **Create** — `worktree_create(branch: "feature/x")` creates the worktree, syncs configured files, runs `postCreate` hooks, and registers it in a SQLite registry.
2. **Work** — the agent uses the `bash` tool with `workdir=<path>` (or a delegated subagent with that cwd). No terminal is spawned.
3. **Apply** — `worktree_apply(branch: "feature/x", mode: "merge")`:
   - commits any uncommitted worktree changes as a snapshot (`commitPending: false` to skip)
   - runs `git merge` in the main checkout
   - reports merged commits, changed files, and any conflicts as a file list (left for resolution)
   - `mode: "overwrite"` resolves all conflicts in favor of the worktree branch
   - `noFF: true` forces a merge commit (`--no-ff`) instead of a linear fast-forward, preserving the branch topology as a merge record
   - `deleteAfter: true` removes the worktree after a clean merge
4. **Cleanup** — `worktree_delete(branch, ...)` commits a snapshot, removes the worktree, and deletes the branch when safe; `worktree_gc()` prunes stale worktrees.

Worktrees are stored in `~/.local/share/opencode/worktree/<project-id>/<branch>/` outside your repository.

## Tools

| Tool | Purpose |
|------|---------|
| `worktree_create(branch, baseBranch?)` | Create an isolated git worktree. Returns the worktree path to work in. |
| `worktree_apply(branch, mode?, commitPending?, deleteAfter?, noFF?)` | Merge the worktree branch into the main checkout. `merge` (default) surfaces conflicts as a file list; `overwrite` lets the worktree win; `noFF: true` preserves topology with a merge commit. |
| `worktree_delete(branch, deleteBranch?, commitPending?, reason?)` | Commit a snapshot and remove the worktree. `deleteBranch` controls branch cleanup: `auto` (default) deletes the branch only if merged into its base, `always` force-deletes (`-D`), `never` keeps it. `commitPending: false` discards uncommitted changes instead of snapshotting them. |
| `worktree_list()` | List worktrees (reconciled with `git worktree list`) with path, age, merge status, and an `*` marker for entries past `gc.maxAgeDays`. Git-only worktrees are shown as `(unregistered)`. |
| `worktree_gc(dryRun?, maxAgeDays?)` | Prune stale worktrees: unregister entries whose git worktree is gone, remove expired-and-merged ones. `dryRun: true` previews without changing anything; `maxAgeDays` overrides the configured threshold. |
| `worktree_resolve_conflicts(strategy)` | Resolve a pending merge in the main checkout: `ours`/`theirs` resolves every conflicted file in favor of that side and stages it (finish with `git commit`); `abort` cancels the merge. |

### Usage examples

```yaml
worktree_create:
  branch: "feature/dark-mode"
  baseBranch: "main"
```

```yaml
worktree_apply:
  branch: "feature/dark-mode"
  mode: "merge"
  deleteAfter: true
  noFF: true  # keep a merge commit instead of linearizing
```

```yaml
worktree_delete:
  branch: "feature/dark-mode"
  deleteBranch: "auto"  # deletes the branch since it's merged
  reason: "Feature complete, merged to main"
```

```yaml
worktree_gc:
  dryRun: true  # preview what would be pruned
```

```yaml
worktree_resolve_conflicts:
  strategy: "theirs"  # or "ours"; "abort" cancels the pending merge
```

## Installation

Copy [`src/`](./src) to your project's `.opencode/plugin/`:

```bash
mkdir -p .opencode/plugin
cp -r src/plugin/* .opencode/plugin/
```

**Requirements:**
- `bun` (for `bun:sqlite` and the Bun runtime APIs used by the plugin)
- `jsonc-parser` and `zod` available to the plugin loader (`bun add jsonc-parser zod` inside the plugin directory, or symlink from a shared location)
- `@opencode-ai/plugin` and `@opencode-ai/sdk` (bundled with opencode; pinned via `package.json` for typechecking)

## Configuration

Auto-creates `.opencode/worktree.jsonc` on first use:

```jsonc
{
  "worktreePath": "~/my-worktrees", // optional custom storage base

  "sync": {
    "copyFiles": [".env", ".env.local"], // copied into new worktrees
    "symlinkDirs": ["node_modules"],     // symlinked (saves disk space)
    "exclude": []
  },

  "hooks": {
    "postCreate": ["pnpm install"],      // run after creation
    "preDelete": ["docker compose down"] // run before deletion
  },

  "gc": {
    "enabled": true,        // automatic stale-worktree pruning
    "maxAgeDays": 30,       // prune worktrees older than this
    "onlyIfMerged": true    // only prune branches merged into their base
  }
}
```

## GC (stale-worktree cleanup)

Runs on plugin load, before each `worktree_create`, and on `session.idle` — and on demand via `worktree_gc`:

1. Unregisters entries whose git worktree no longer exists (removed manually).
2. Removes worktrees older than `maxAgeDays` whose branch is merged into its base branch (safe by default — `onlyIfMerged: false` disables the guard).

`worktree_gc(dryRun: true)` lists exactly what would be pruned without touching anything, and `worktree_gc(maxAgeDays: N)` overrides the configured threshold — useful for exercising the age-based path in-session without aging the database. `worktree_list` also reconciles the registry with git on every call, so manual `git worktree remove` never leaves a stale entry visible.

## Suggested workflow (agentic harness)

Pair with a `lead` agent that delegates to worktrees in parallel:

- Independent tasks → `worktree_create` each, then `worktree_apply(branch, mode: "merge")` back before the final report.
- Flat delegation: subagents never spawn subagents.
- If an apply surfaces conflicts, resolve them with `worktree_resolve_conflicts(strategy: "ours"/"theirs")` and finish with `git commit`, or abort and re-plan.

## Security

- Branch names validated against git ref rules and shell metacharacters.
- File sync paths validated against directory traversal and symlink escapes.
- All git commands run via `Bun.spawn` with argument arrays — no shell interpolation.
- GC only removes merged, expired worktrees (configurable).

## License

MIT. Forked from [kdcokenny/opencode-worktree](https://github.com/kdcokenny/opencode-worktree), originally inspired by [opencode-worktree-session](https://github.com/felixAnhalt/opencode-worktree-session) by Felix Anhalt.