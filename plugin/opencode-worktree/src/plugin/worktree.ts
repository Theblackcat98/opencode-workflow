/**
 * Agent-Centric Worktree Plugin
 *
 * Creates, merges, and cleans up git worktrees for AI development sessions.
 * No terminals are spawned — the agent works in worktrees via the bash tool
 * (or delegated subagents) and merges changes back with worktree_apply.
 *
 * Forked from https://github.com/kdcokenny/opencode-worktree (MIT).
 * Inspired by opencode-worktree-session by Felix Anhalt
 * https://github.com/felixAnhalt/opencode-worktree-session
 */

import type { Database } from "bun:sqlite"
import * as path from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
import { z } from "zod"

import { loadWorktreeConfig, type WorktreeConfig } from "./worktree/config"
import {
	abortMerge,
	commitAll,
	createWorktree,
	deleteBranch,
	getChangedFiles,
	getCurrentBranch,
	getMainRoot,
	hasUncommittedChanges,
	isBranchAncestor,
	listWorktrees,
	mergeBranch,
	overwriteBranch,
	removeWorktree,
	resolveConflicts,
} from "./worktree/git"
import {
	getAllWorktrees,
	getWorktree,
	initStateDb,
	registerWorktree,
	unregisterWorktree,
} from "./worktree/state"
import { copyFiles, runHooks, symlinkDirs } from "./worktree/sync"
import type { Logger } from "./worktree/types"

/** Maximum retries for database initialization */
const DB_MAX_RETRIES = 3

/** Delay between retry attempts in milliseconds */
const DB_RETRY_DELAY_MS = 100

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

/**
 * Git branch name validation - blocks invalid refs and shell metacharacters
 * Characters blocked: control chars (0x00-0x1f, 0x7f), ~^:?*[]\\, and shell metacharacters
 */
function isValidBranchName(name: string): boolean {
	// Check for control characters
	for (let i = 0; i < name.length; i++) {
		const code = name.charCodeAt(i)
		if (code <= 0x1f || code === 0x7f) return false
	}
	// Check for invalid git ref characters and shell metacharacters
	if (/[~^:?*[\]\\;&|`$()]/.test(name)) return false
	return true
}

const branchNameSchema = z
	.string()
	.min(1, "Branch name cannot be empty")
	.max(255, "Branch name too long")
	.refine((name) => !name.startsWith("-"), {
		message: "Branch name cannot start with '-' (prevents option injection)",
	})
	.refine((name) => !name.startsWith("/") && !name.endsWith("/"), {
		message: "Branch name cannot start or end with '/'",
	})
	.refine((name) => !name.includes("//"), {
		message: "Branch name cannot contain '//'",
	})
	.refine((name) => !name.includes("@{"), {
		message: "Branch name cannot contain '@{' (git reflog syntax)",
	})
	.refine((name) => !name.includes(".."), {
		message: "Branch name cannot contain '..'",
	})
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Control character detection is intentional for security
	.refine((name) => !/[\x00-\x1f\x7f ~^:?*[\]\\]/.test(name), {
		message: "Branch name contains invalid characters",
	})
	.refine((name) => isValidBranchName(name), "Contains invalid git ref characters")
	.refine((name) => !name.startsWith(".") && !name.endsWith("."), "Cannot start or end with dot")
	.refine((name) => !name.endsWith(".lock"), "Cannot end with .lock")

// =============================================================================
// MODULE-LEVEL STATE
// =============================================================================

/** Database instance - initialized once per plugin lifecycle */
let db: Database | null = null

/** Project root path - stored on first initialization */
let projectRoot: string | null = null

/** Main checkout root - resolved on first initialization */
let mainRoot: string | null = null

/** Flag to prevent duplicate cleanup handler registration */
let cleanupRegistered = false

/**
 * Register process cleanup handlers for graceful database shutdown.
 * Ensures WAL checkpoint and proper close on process termination.
 */
function registerCleanupHandlers(database: Database): void {
	if (cleanupRegistered) return // Early exit guard
	cleanupRegistered = true

	const cleanup = () => {
		try {
			database.exec("PRAGMA wal_checkpoint(TRUNCATE)")
			database.close()
		} catch {
			// Best effort cleanup - process is exiting anyway
		}
	}

	process.once("SIGTERM", cleanup)
	process.once("SIGINT", cleanup)
	process.once("beforeExit", cleanup)
}

/**
 * Get the database instance, initializing if needed.
 * Includes retry logic for transient initialization failures.
 */
async function getDb(log: Logger): Promise<Database> {
	if (db) return db

	if (!projectRoot) {
		throw new Error("Database not initialized: projectRoot not set. Call initDb() first.")
	}

	let lastError: Error | null = null

	for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
		try {
			db = await initStateDb(projectRoot)
			registerCleanupHandlers(db)
			return db
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			log.warn(`Database init attempt ${attempt}/${DB_MAX_RETRIES} failed: ${lastError.message}`)

			if (attempt < DB_MAX_RETRIES) {
				Bun.sleepSync(DB_RETRY_DELAY_MS)
			}
		}
	}

	throw new Error(
		`Failed to initialize database after ${DB_MAX_RETRIES} attempts: ${lastError?.message}`,
	)
}

/**
 * Initialize the database with the project root path.
 * Must be called once before any getDb() calls.
 */
async function initDb(root: string, log: Logger): Promise<Database> {
	projectRoot = root
	return getDb(log)
}

// =============================================================================
// RESOLUTION HELPERS
// =============================================================================

/**
 * Resolve the main checkout root from the plugin directory.
 */
async function getMainRootOrThrow(log: Logger): Promise<string> {
	if (mainRoot) return mainRoot

	const result = await getMainRoot(projectRoot ?? process.cwd())
	if (!result.ok) {
		throw new Error(`Not a git repository: ${result.error}`)
	}
	mainRoot = result.value
	return mainRoot
}

/**
 * Resolve a worktree's path for a branch, checking the registry first and
 * falling back to `git worktree list`.
 */
async function resolveWorktreePath(
	database: Database,
	repoRoot: string,
	branch: string,
	log: Logger,
): Promise<string | null> {
	// Registry lookup first
	const registered = getWorktree(database, branch)
	if (registered) return registered.path

	// Fallback: git worktree list
	const listResult = await listWorktrees(repoRoot)
	if (!listResult.ok) {
		log.warn(`[worktree] Failed to list worktrees: ${listResult.error}`)
		return null
	}

	const match = listResult.value.find((entry) => entry.branch === branch)
	return match?.path ?? null
}

// =============================================================================
// STALE-WORKTREE GC
// =============================================================================

/** Result of a GC pass — what was (or would be) cleaned up and why things were kept */
interface GcReport {
	dryRun: boolean
	/** Branches whose registry entry was removed (git worktree no longer exists) */
	unregistered: string[]
	/** Branches whose worktree was (or would be) removed for age/merge reasons */
	pruned: string[]
	/** Branches examined but kept, with reasons */
	kept: { branch: string; reason: string }[]
}

/**
 * Prune stale worktrees:
 * 1. Unregister entries whose git worktree no longer exists (removed manually).
 * 2. Remove registered worktrees older than maxAgeDays whose branch is merged
 *    into its base branch (mirrors grok-build's auto_gc semantics).
 *
 * With `dryRun: true` nothing is modified — the report lists what would change.
 * `maxAgeDays` and `now` override the configured threshold and clock, making the
 * age-based path testable in-session.
 */
async function runGc(
	database: Database,
	repoRoot: string,
	config: WorktreeConfig,
	log: Logger,
	options: { dryRun?: boolean; maxAgeDays?: number; now?: number } = {},
): Promise<GcReport> {
	const report: GcReport = {
		dryRun: options.dryRun ?? false,
		unregistered: [],
		pruned: [],
		kept: [],
	}
	const records = getAllWorktrees(database)
	if (records.length === 0) return report

	const listResult = await listWorktrees(repoRoot)
	if (!listResult.ok) return report

	const livePaths = new Set(listResult.value.map((entry) => path.resolve(entry.path)))
	const now = options.now ?? Date.now()
	const maxAgeDays = options.maxAgeDays ?? config.gc.maxAgeDays

	for (const record of records) {
		const resolvedPath = path.resolve(record.path)
		const isLive = livePaths.has(resolvedPath)

		// Registry cleanup: entry references a worktree that no longer exists
		if (!isLive) {
			report.unregistered.push(record.branch)
			if (!report.dryRun) {
				unregisterWorktree(database, record.branch)
				log.info(`[worktree] GC: unregistering stale entry ${record.branch} (${record.path})`)
			}
			continue
		}

		// Age-based pruning (only if enabled and safely merged)
		if (!config.gc.enabled) {
			report.kept.push({ branch: record.branch, reason: "gc disabled" })
			continue
		}

		const ageDays = (now - Date.parse(record.createdAt)) / 86_400_000
		if (!Number.isFinite(ageDays) || ageDays < maxAgeDays) {
			report.kept.push({
				branch: record.branch,
				reason: `age ${Number.isFinite(ageDays) ? `${ageDays.toFixed(1)}d` : "?"} < maxAgeDays ${maxAgeDays}d`,
			})
			continue
		}

		const base = record.baseBranch
		if (config.gc.onlyIfMerged && base) {
			const merged = await isBranchAncestor(repoRoot, record.branch, base)
			if (!merged.ok || !merged.value) {
				report.kept.push({ branch: record.branch, reason: "not merged into base branch" })
				continue
			}
		} else if (config.gc.onlyIfMerged && !base) {
			// No base branch recorded — never prune without certainty
			report.kept.push({ branch: record.branch, reason: "no base branch recorded" })
			continue
		}

		if (report.dryRun) {
			report.pruned.push(record.branch)
			continue
		}

		// Snapshot any uncommitted changes before pruning
		const dirty = await hasUncommittedChanges(resolvedPath)
		if (dirty.ok && dirty.value) {
			await commitAll(resolvedPath, "chore(worktree): gc snapshot")
		}

		const removeResult = await removeWorktree(repoRoot, resolvedPath)
		if (!removeResult.ok) {
			log.warn(`[worktree] GC: failed to remove stale worktree ${record.branch}: ${removeResult.error}`)
			report.kept.push({ branch: record.branch, reason: `remove failed: ${removeResult.error}` })
			continue
		}

		unregisterWorktree(database, record.branch)
		report.pruned.push(record.branch)
		log.info(`[worktree] GC: pruned stale worktree ${record.branch} (${record.path})`)
	}

	return report
}

/**
 * Format a GC report for tool output.
 */
function formatGcReport(report: GcReport): string {
	const lines: string[] = []
	lines.push(
		`GC ${report.dryRun ? "dry-run" : "run"}${report.dryRun ? " — nothing was changed" : " — completed"}:`,
	)

	if (report.unregistered.length > 0) {
		lines.push(
			`\n${report.dryRun ? "Would unregister" : "Unregistered"} ${report.unregistered.length} stale entr${
				report.unregistered.length === 1 ? "y" : "ies"
			} (git worktree no longer exists): ${report.unregistered.join(", ")}`,
		)
	}
	if (report.pruned.length > 0) {
		lines.push(
			`\n${report.dryRun ? "Would prune" : "Pruned"} ${report.pruned.length} worktree${
				report.pruned.length === 1 ? "" : "s"
			} (expired and merged): ${report.pruned.join(", ")}`,
		)
	}
	if (report.kept.length > 0) {
		lines.push(`\nKept ${report.kept.length} (${report.kept.length === 1 ? "entry" : "entries"}):`)
		for (const kept of report.kept) {
			lines.push(`  - ${kept.branch}: ${kept.reason}`)
		}
	}

	if (report.unregistered.length + report.pruned.length + report.kept.length === 0) {
		lines.push(`No registered worktrees.`)
	}
	return lines.join("\n")
}

// =============================================================================
// PLUGIN ENTRY
// =============================================================================

const WorktreePlugin: Plugin = async (ctx) => {
	const { directory, client } = ctx

	const log: Logger = {
		debug: (msg: string) =>
			client.app
				.log({ body: { service: "worktree", level: "debug", message: msg } })
				.catch(() => {}),
		info: (msg: string) =>
			client.app
				.log({ body: { service: "worktree", level: "info", message: msg } })
				.catch(() => {}),
		warn: (msg: string) =>
			client.app
				.log({ body: { service: "worktree", level: "warn", message: msg } })
				.catch(() => {}),
		error: (msg: string) =>
			client.app
				.log({ body: { service: "worktree", level: "error", message: msg } })
				.catch(() => {}),
	}

	// Initialize SQLite database
	const database = await initDb(directory, log)

	// Run stale-worktree GC on plugin load
	try {
		await runGc(database, await getMainRootOrThrow(log), await loadWorktreeConfig(directory, log), log)
	} catch {
		// GC is best-effort — never block plugin startup
	}

	return {
		tool: {
			worktree_create: tool({
				description:
					"Create a new git worktree for isolated development. No terminal is spawned — work in the worktree via the bash tool (workdir=<path>) or delegate to a subagent with that cwd, then merge changes back with worktree_apply.",
				args: {
					branch: tool.schema
						.string()
						.describe("Branch name for the worktree (e.g., 'feature/dark-mode')"),
					baseBranch: tool.schema
						.string()
						.optional()
						.describe("Base branch to create from (defaults to HEAD)"),
				},
				async execute(args) {
					// Validate branch name at boundary
					const branchResult = branchNameSchema.safeParse(args.branch)
					if (!branchResult.success) {
						return `❌ Invalid branch name: ${branchResult.error.issues[0]?.message}`
					}

					// Validate base branch name at boundary
					if (args.baseBranch) {
						const baseResult = branchNameSchema.safeParse(args.baseBranch)
						if (!baseResult.success) {
							return `❌ Invalid base branch name: ${baseResult.error.issues[0]?.message}`
						}
					}

					let repoRoot: string
					try {
						repoRoot = await getMainRootOrThrow(log)
					} catch (error) {
						return `❌ ${error instanceof Error ? error.message : String(error)}`
					}

					// Load config first so worktreePath is available for createWorktree
					const worktreeConfig = await loadWorktreeConfig(directory, log)

					// Prune stale worktrees before creating (mirrors auto_gc before spawn)
					try {
						await runGc(database, repoRoot, worktreeConfig, log)
					} catch (gcError) {
						log.warn(`[worktree] GC before create failed: ${gcError}`)
					}

					// Create worktree
					const result = await createWorktree(
						repoRoot,
						args.branch,
						args.baseBranch,
						worktreeConfig.worktreePath,
					)
					if (!result.ok) {
						return `Failed to create worktree: ${result.error}`
					}

					const worktreePath = result.value

					// Sync files from main worktree
					if (worktreeConfig.sync.copyFiles.length > 0) {
						await copyFiles(repoRoot, worktreePath, worktreeConfig.sync.copyFiles, log)
					}

					// Symlink directories
					if (worktreeConfig.sync.symlinkDirs.length > 0) {
						await symlinkDirs(repoRoot, worktreePath, worktreeConfig.sync.symlinkDirs, log)
					}

					// Run postCreate hooks
					if (worktreeConfig.hooks.postCreate.length > 0) {
						await runHooks(worktreePath, worktreeConfig.hooks.postCreate, log)
					}

					// Register in the worktree registry
					registerWorktree(database, {
						branch: args.branch,
						path: worktreePath,
						baseBranch: args.baseBranch ?? null,
					})

					return `Worktree created at ${worktreePath} on branch '${args.branch}'.\n\nTo work there: use the bash tool with workdir="${worktreePath}", or delegate with the task tool and tell the subagent its cwd is "${worktreePath}".\nWhen done, merge changes back with worktree_apply(branch: "${args.branch}", mode: "merge").`
				},
			}),

			worktree_apply: tool({
				description:
					"Merge a worktree's changes back into the main checkout. mode 'merge' performs a git merge and reports any conflicts as a file list; mode 'overwrite' merges with all conflicts resolved in favor of the worktree branch. Uncommitted worktree changes are committed as a snapshot first (commitPending: false to skip).",
				args: {
					branch: tool.schema
						.string()
						.describe("Branch name of the worktree to merge back (e.g., 'feature/dark-mode')"),
					mode: tool.schema
						.enum(["merge", "overwrite"])
						.optional()
						.describe(
							"merge (default): git merge with conflicts surfaced. overwrite: worktree branch wins all conflicts",
						),
					commitPending: tool.schema
						.boolean()
						.optional()
						.describe("Commit uncommitted worktree changes as a snapshot before merging (default: true)"),
					deleteAfter: tool.schema
						.boolean()
						.optional()
						.describe("Remove the worktree after a successful merge with no conflicts (default: false)"),
					noFF: tool.schema
						.boolean()
						.optional()
						.describe(
							"Force a merge commit (git merge --no-ff), preserving the branch topology as a merge record instead of a linear fast-forward (default: false)",
						),
				},
				async execute(args) {
					const branchResult = branchNameSchema.safeParse(args.branch)
					if (!branchResult.success) {
						return `❌ Invalid branch name: ${branchResult.error.issues[0]?.message}`
					}

					let repoRoot: string
					try {
						repoRoot = await getMainRootOrThrow(log)
					} catch (error) {
						return `❌ ${error instanceof Error ? error.message : String(error)}`
					}

					const mode = args.mode ?? "merge"
					const commitPending = args.commitPending ?? true
					const noFF = args.noFF ?? false

					// Resolve the worktree path (registry first, then git)
					const worktreePath = await resolveWorktreePath(database, repoRoot, args.branch, log)

					// Commit pending changes in the worktree before merging
					let snapshotCommitted = false
					if (worktreePath && commitPending) {
						const dirty = await hasUncommittedChanges(worktreePath)
						if (dirty.ok && dirty.value) {
							const commitResult = await commitAll(
								worktreePath,
								"chore(worktree): snapshot before merge",
							)
							if (!commitResult.ok) {
								return `❌ Failed to commit pending changes in worktree ${worktreePath}: ${commitResult.error}`
							}
							snapshotCommitted = true
						}
					} else if (!worktreePath) {
						log.info(
							`[worktree] No registered worktree path for ${args.branch}; merging branch directly`,
						)
					}

					// Check main checkout is clean enough to merge into
					const currentBranch = await getCurrentBranch(repoRoot)
					const mainDirty = await hasUncommittedChanges(repoRoot)
					if (mainDirty.ok && mainDirty.value) {
						return `❌ Main checkout has uncommitted changes. Commit or stash them in ${repoRoot} before merging.`
					}

const report =
					mode === "overwrite"
						? await overwriteBranch(repoRoot, args.branch)
						: await mergeBranch(repoRoot, args.branch, noFF)

					if (!report.ok) {
						return `❌ Merge failed: ${report.error}`
					}

					// Build result summary
					const targetBranch = currentBranch.ok ? currentBranch.value : "current branch"
					const lines: string[] = []

					if (snapshotCommitted) {
						lines.push(`📸 Committed pending worktree changes as a snapshot (${worktreePath})`)
					}
					lines.push(
						`🔀 Merged branch '${args.branch}' into '${targetBranch}' (mode: ${mode}${
							noFF ? ", no-ff" : ""
						})${report.mergedCommits > 0 ? ` — ${report.mergedCommits} commit(s)` : ""}`,
					)

					if (report.conflicts.length > 0) {
						lines.push(
							`⚠️ Conflicts in ${report.conflicts.length} file(s): ${report.conflicts.join(", ")}`,
						)
						lines.push(
							"Resolve them in the main checkout (edit + `git add` + `git commit` to finish the merge), then verify with git status.",
						)
						return lines.join("\n")
					}

					const changed = await getChangedFiles(repoRoot)
					lines.push(
						changed.ok && changed.value.length > 0
							? `Files changed: ${changed.value.join(", ")}`
							: "No files changed (branch was already up to date).",
					)

					if (args.deleteAfter) {
						// Remove the worktree after successful merge
						if (worktreePath) {
							const removeResult = await removeWorktree(repoRoot, worktreePath)
							if (removeResult.ok) {
								unregisterWorktree(database, args.branch)
								lines.push(`🗑️ Worktree removed: ${worktreePath}`)
							} else {
								lines.push(
									`⚠️ Worktree kept (remove failed): ${worktreePath} — ${removeResult.error}`,
								)
							}
						}
					} else if (worktreePath) {
						lines.push(`Worktree kept at ${worktreePath} — call worktree_delete when done.`)
					}

					return lines.join("\n")
				},
			}),

			worktree_delete: tool({
				description:
					"Delete a worktree by branch. Uncommitted changes are committed as a snapshot first (commitPending: false discards them instead). After removal the branch is deleted when safe: deleteBranch 'auto' deletes it only if merged into its base branch, 'always' force-deletes, 'never' keeps it.",
				args: {
					branch: tool.schema
						.string()
						.describe("Branch of the worktree to delete"),
					deleteBranch: tool.schema
						.enum(["auto", "always", "never"])
						.optional()
						.describe(
							"Whether to delete the branch after removing the worktree: 'auto' (default) deletes only if merged into its base branch, 'always' force-deletes (-D), 'never' keeps the branch",
						),
					commitPending: tool.schema
						.boolean()
						.optional()
						.describe(
							"Commit uncommitted worktree changes as a snapshot before removal (default: true); false discards them",
						),
					reason: tool.schema
						.string()
						.optional()
						.describe("Brief explanation of why you are deleting this worktree"),
				},
				async execute(args) {
					let repoRoot: string
					try {
						repoRoot = await getMainRootOrThrow(log)
					} catch (error) {
						return `❌ ${error instanceof Error ? error.message : String(error)}`
					}

					const branchResult = branchNameSchema.safeParse(args.branch)
					if (!branchResult.success) {
						return `❌ Invalid branch name: ${branchResult.error.issues[0]?.message}`
					}

					const worktreePath = await resolveWorktreePath(database, repoRoot, args.branch, log)
					if (!worktreePath) {
						return `No worktree found for branch '${args.branch}' (neither registered nor listed by git).`
					}

					// Capture registry record before removal (needed for branch-deletion decision)
					const record = getWorktree(database, args.branch)

					// Run preDelete hooks before cleanup
					const config = await loadWorktreeConfig(directory, log)
					if (config.hooks.preDelete.length > 0) {
						await runHooks(worktreePath, config.hooks.preDelete, log)
					}

					// Commit or discard any uncommitted changes
					const commitPending = args.commitPending ?? true
					const dirty = await hasUncommittedChanges(worktreePath)
					let committedSnapshot = false
					let discardedChanges = false
					if (dirty.ok && dirty.value) {
						if (commitPending) {
							const commitResult = await commitAll(
								worktreePath,
								"chore(worktree): session snapshot",
							)
							if (commitResult.ok) {
								committedSnapshot = true
							} else {
								log.warn(`[worktree] git commit failed: ${commitResult.error}`)
							}
						} else {
							discardedChanges = true
						}
					}

					// Remove worktree
					const removeResult = await removeWorktree(repoRoot, worktreePath)
					if (!removeResult.ok) {
						return `❌ Failed to remove worktree: ${removeResult.error}`
					}

					// Unregister from database
					unregisterWorktree(database, args.branch)

					const lines = [`🗑️ Worktree removed: ${worktreePath} (branch '${args.branch}')`]
					if (committedSnapshot) {
						lines.push(`📸 Uncommitted changes were committed as a snapshot first.`)
					}
					if (discardedChanges) {
						lines.push(`⚠️ Uncommitted changes were discarded (commitPending: false).`)
					}

					// Branch cleanup
					const deleteMode = args.deleteBranch ?? "auto"
					if (deleteMode !== "never") {
						const currentBranch = await getCurrentBranch(repoRoot)
						const base = record?.baseBranch ?? (currentBranch.ok ? currentBranch.value : null)

						if (deleteMode === "always") {
							const del = await deleteBranch(repoRoot, args.branch, true)
							lines.push(
								del.ok
									? `🗑️ Branch '${args.branch}' deleted (force).`
									: `⚠️ Branch deletion failed: ${del.error}`,
							)
						} else if (base) {
							// auto: delete only if merged into the base branch
							const merged = await isBranchAncestor(repoRoot, args.branch, base)
							if (merged.ok && merged.value) {
								const del = await deleteBranch(repoRoot, args.branch)
								lines.push(
									del.ok
										? `🗑️ Branch '${args.branch}' deleted (merged into '${base}').`
										: `⚠️ Branch deletion failed: ${del.error}`,
								)
							} else {
								lines.push(
									`ℹ️ Branch '${args.branch}' kept (not merged into '${base}'). Delete manually with git branch -D if intended.`,
								)
							}
						} else {
							lines.push(`ℹ️ Branch '${args.branch}' kept (no base branch recorded).`)
						}
					} else {
						lines.push(`ℹ️ Branch '${args.branch}' kept (deleteBranch: "never").`)
					}

					if (args.reason) {
						lines.push(`Reason: ${args.reason}`)
					}
					return lines.join("\n")
				},
			}),

			worktree_list: tool({
				description:
					"List all worktrees for this repository, including branch, path, age, and merge status relative to the base branch. Reconciles the registry with git first: entries whose worktree no longer exists are unregistered, and git-only worktrees are shown as (unregistered).",
				args: {},
				async execute() {
					let repoRoot: string
					try {
						repoRoot = await getMainRootOrThrow(log)
					} catch (error) {
						return `❌ ${error instanceof Error ? error.message : String(error)}`
					}

					const config = await loadWorktreeConfig(directory, log)

					const listResult = await listWorktrees(repoRoot)
					const gitEntries = listResult.ok ? listResult.value : []
					const livePaths = new Set(gitEntries.map((entry) => path.resolve(entry.path)))

					// Reconcile: unregister entries whose git worktree no longer exists
					let reconciled = 0
					for (const record of getAllWorktrees(database)) {
						if (!livePaths.has(path.resolve(record.path))) {
							unregisterWorktree(database, record.branch)
							reconciled++
						}
					}
					const registered = getAllWorktrees(database)

					// Git-only worktrees not present in the registry
					const registeredBranches = new Set(registered.map((record) => record.branch))
					const gitOnly = gitEntries.filter(
						(entry) => entry.branch && !registeredBranches.has(entry.branch),
					)

					if (registered.length === 0 && gitOnly.length === 0) {
						return `No worktrees registered. Create one with worktree_create(branch: "...").`
					}

					const currentBranch = await getCurrentBranch(repoRoot)
					const current = currentBranch.ok ? currentBranch.value : "?"

					const lines = [
						`Main checkout: ${repoRoot} (branch '${current}')`,
						...((reconciled > 0
							? [`Reconciled: unregistered ${reconciled} stale entr${reconciled === 1 ? "y" : "ies"} (no git worktree).`]
							: []) as string[]),
						``,
						`Branch                    Path                                             Age         Merged`,
					]

					const now = Date.now()
					const maxAgeDays = config.gc.enabled ? config.gc.maxAgeDays : null

					for (const record of registered) {
						const ageDays = (now - Date.parse(record.createdAt)) / 86_400_000
						const expired =
							maxAgeDays !== null && Number.isFinite(ageDays) && ageDays >= maxAgeDays
						const ageLabel = Number.isFinite(ageDays)
							? `${Math.round(ageDays)}d${expired ? "*" : ""}`
							: "?"
						const base = record.baseBranch ?? current
						const merged = await isBranchAncestor(repoRoot, record.branch, base)
						const mergedLabel = merged.ok && merged.value ? "yes" : "no"

						lines.push(
							`${record.branch.padEnd(26)}${record.path.padEnd(48)}${ageLabel.padEnd(10)}${mergedLabel}`,
						)
					}

					for (const entry of gitOnly) {
						lines.push(
							`${(entry.branch ?? "?").padEnd(26)}${entry.path.padEnd(48)}${"?".padEnd(10)}(unregistered)`,
						)
					}

					lines.push(
						``,
						...(maxAgeDays !== null ? [`* = expired (age >= gc.maxAgeDays ${maxAgeDays}d)`] : []),
						`Apply a worktree back with worktree_apply(branch: "<branch>", mode: "merge").`,
						`Prune stale worktrees with worktree_gc(dryRun: true) to preview, or worktree_gc() to run.`,
					)
					return lines.join("\n")
				},
			}),

			worktree_gc: tool({
				description:
					"Prune stale worktrees: unregister entries whose git worktree no longer exists, and remove worktrees older than gc.maxAgeDays whose branch is merged into its base branch. dryRun: true lists what would be pruned without changing anything. maxAgeDays overrides the configured threshold (useful for testing the age-based path in-session).",
				args: {
					dryRun: tool.schema
						.boolean()
						.optional()
						.describe("List what would be pruned without changing anything (default: false)"),
					maxAgeDays: tool.schema
						.number()
						.optional()
						.describe("Override the configured gc.maxAgeDays threshold (default: config value)"),
				},
				async execute(args) {
					let repoRoot: string
					try {
						repoRoot = await getMainRootOrThrow(log)
					} catch (error) {
						return `❌ ${error instanceof Error ? error.message : String(error)}`
					}

					const config = await loadWorktreeConfig(directory, log)
					const report = await runGc(database, repoRoot, config, log, {
						dryRun: args.dryRun ?? false,
						maxAgeDays: args.maxAgeDays,
					})
					return formatGcReport(report)
				},
			}),

			worktree_resolve_conflicts: tool({
				description:
					"Resolve pending merge conflicts in the main checkout left by worktree_apply. strategy 'ours'/'theirs' resolves every conflicted file in favor of that side and stages the result — the merge stays in progress, finish it with git commit (or abort). strategy 'abort' cancels the pending merge with git merge --abort.",
				args: {
					strategy: tool.schema
						.enum(["ours", "theirs", "abort"])
						.describe(
							"'ours'/'theirs': resolve all conflicts in favor of that side and stage them. 'abort': cancel the pending merge",
						),
				},
				async execute(args) {
					let repoRoot: string
					try {
						repoRoot = await getMainRootOrThrow(log)
					} catch (error) {
						return `❌ ${error instanceof Error ? error.message : String(error)}`
					}

					if (args.strategy === "abort") {
						const result = await abortMerge(repoRoot)
						if (!result.ok) {
							return `Failed to abort merge: ${result.error}`
						}
						return `Merge aborted in ${repoRoot}. Working tree restored to the pre-merge state.`
					}

					const result = await resolveConflicts(repoRoot, args.strategy)
					if (!result.ok) {
						return `❌ Failed to resolve conflicts: ${result.error}`
					}
					if (result.value.length === 0) {
						return `No unresolved conflicts found in ${repoRoot}.`
					}

					return [
						`Resolved ${result.value.length} file(s) in favor of '${args.strategy}': ${result.value.join(", ")}`,
						`Changes are staged. The merge is still in progress — run \`git commit\` in ${repoRoot} to finish it, or worktree_resolve_conflicts(strategy: "abort") to undo.`,
					].join("\n")
				},
			}),
		},

		event: async ({ event }: { event: Event }): Promise<void> => {
			if (event.type !== "session.idle") return

			// Best-effort stale-worktree GC on session idle
			try {
				const config = await loadWorktreeConfig(directory, log)
				await runGc(database, await getMainRootOrThrow(log), config, log)
			} catch (gcError) {
				log.warn(`[worktree] GC on idle failed: ${gcError}`)
			}
		},
	}
}

export default WorktreePlugin