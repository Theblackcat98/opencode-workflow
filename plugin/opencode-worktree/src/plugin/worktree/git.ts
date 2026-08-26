/**
 * Git Operations Module for the Worktree Plugin
 *
 * All git commands run via Bun.spawn with explicit argument arrays —
 * no shell interpolation, preventing command injection.
 */

import { mkdir } from "node:fs/promises"
import * as path from "node:path"
import { getWorktreePath } from "./state"

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface OkResult<T> {
	readonly ok: true
	readonly value: T
}
export interface ErrResult<E> {
	readonly ok: false
	readonly error: E
}
export type Result<T, E = string> = OkResult<T> | ErrResult<E>

export const Result = {
	ok: <T>(value: T): OkResult<T> => ({ ok: true, value }),
	err: <E>(error: E): ErrResult<E> => ({ ok: false, error }),
}

// =============================================================================
// GIT COMMAND EXECUTION
// =============================================================================

/**
 * Execute a git command safely using Bun.spawn with explicit array.
 * Avoids shell interpolation entirely by passing args as array.
 */
export async function git(args: string[], cwd: string): Promise<Result<string>> {
	try {
		const proc = Bun.spawn(["git", ...args], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		})
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		])
		if (exitCode !== 0) {
			return Result.err(stderr.trim() || `git ${args[0]} failed`)
		}
		return Result.ok(stdout.trim())
	} catch (error) {
		return Result.err(error instanceof Error ? error.message : String(error))
	}
}

// =============================================================================
// REPOSITORY INFO
// =============================================================================

/**
 * Resolve the main (primary) checkout root from any worktree.
 *
 * `git rev-parse --git-common-dir` returns the shared .git directory of the
 * repository from any linked worktree; the main checkout is its parent.
 */
export async function getMainRoot(cwd: string): Promise<Result<string>> {
	const result = await git(["rev-parse", "--git-common-dir"], cwd)
	if (!result.ok) return result

	const commonDir = path.resolve(cwd, result.value)
	const mainRoot = path.dirname(commonDir)
	if (!mainRoot || mainRoot === commonDir) {
		return Result.err(`Failed to resolve main checkout root from ${cwd}`)
	}
	return Result.ok(mainRoot)
}

export async function getCurrentBranch(cwd: string): Promise<Result<string>> {
	const result = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
	if (!result.ok) return result
	if (result.value === "HEAD") {
		return Result.err("Current checkout is in detached HEAD state")
	}
	return Result.ok(result.value)
}

export async function getMainBranch(cwd: string): Promise<Result<string>> {
	for (const candidate of ["main", "master"]) {
		const result = await git(["rev-parse", "--verify", candidate], cwd)
		if (result.ok) return Result.ok(candidate)
	}
	return Result.err("Could not determine default branch (no main/master found)")
}

// =============================================================================
// WORKTREE LIFECYCLE
// =============================================================================

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
	const result = await git(["rev-parse", "--verify", branch], cwd)
	return result.ok
}

/**
 * Create a git worktree for a branch, creating the branch if it does not exist.
 */
export async function createWorktree(
	repoRoot: string,
	branch: string,
	baseBranch?: string,
	basePath?: string,
): Promise<Result<string>> {
	const worktreePath = await getWorktreePath(repoRoot, branch, basePath)

	// Ensure parent directory exists
	await mkdir(path.dirname(worktreePath), { recursive: true })

	const exists = await branchExists(repoRoot, branch)

	if (exists) {
		// Checkout existing branch into worktree
		const result = await git(["worktree", "add", worktreePath, branch], repoRoot)
		return result.ok ? Result.ok(worktreePath) : result
	}

	// Create new branch from base
	const base = baseBranch ?? "HEAD"
	const result = await git(["worktree", "add", "-b", branch, worktreePath, base], repoRoot)
	return result.ok ? Result.ok(worktreePath) : result
}

export async function removeWorktree(
	repoRoot: string,
	worktreePath: string,
): Promise<Result<void>> {
	const result = await git(["worktree", "remove", "--force", worktreePath], repoRoot)
	return result.ok ? Result.ok(undefined) : Result.err(result.error)
}

/**
 * Delete a branch. Safe by default (`-d`, only when merged); `force` uses `-D`.
 */
export async function deleteBranch(
	cwd: string,
	branch: string,
	force = false,
): Promise<Result<void>> {
	const result = await git(["branch", force ? "-D" : "-d", branch], cwd)
	return result.ok ? Result.ok(undefined) : Result.err(result.error)
}

export interface WorktreeInfo {
	path: string
	branch: string | null
	detached: boolean
}

/**
 * List all worktrees by parsing `git worktree list --porcelain`.
 */
export async function listWorktrees(repoRoot: string): Promise<Result<WorktreeInfo[]>> {
	const result = await git(["worktree", "list", "--porcelain"], repoRoot)
	if (!result.ok) return result

	const worktrees: WorktreeInfo[] = []
	let current: Partial<WorktreeInfo> | null = null

	for (const line of result.value.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current?.path) {
				worktrees.push({
					path: current.path,
					branch: current.branch ?? null,
					detached: current.detached ?? false,
				})
			}
			current = { path: line.slice("worktree ".length).trim() }
		} else if (line.startsWith("branch refs/heads/") && current) {
			current.branch = line.slice("branch refs/heads/".length).trim()
		} else if (line === "detached" && current) {
			current.detached = true
		} else if (line === "" && current) {
			if (current.path) {
				worktrees.push({
					path: current.path,
					branch: current.branch ?? null,
					detached: current.detached ?? false,
				})
			}
			current = null
		}
	}

	// Flush trailing entry
	if (current?.path) {
		worktrees.push({
			path: current.path,
			branch: current.branch ?? null,
			detached: current.detached ?? false,
		})
	}

	return Result.ok(worktrees)
}

// =============================================================================
// WORKING TREE STATE
// =============================================================================

/**
 * Check whether a checkout has uncommitted changes.
 */
export async function hasUncommittedChanges(cwd: string): Promise<Result<boolean>> {
	const result = await git(["status", "--porcelain"], cwd)
	if (!result.ok) return result
	return Result.ok(result.value.length > 0)
}

/**
 * Stage and commit all pending changes in a checkout.
 */
export async function commitAll(cwd: string, message: string): Promise<Result<void>> {
	const addResult = await git(["add", "-A"], cwd)
	if (!addResult.ok) return Result.err(addResult.error)

	const commitResult = await git(
		["commit", "-m", message, "--allow-empty"],
		cwd,
	)
	return commitResult.ok ? Result.ok(undefined) : Result.err(commitResult.error)
}

/**
 * Check whether a branch is an ancestor of a base branch (i.e. merged).
 */
export async function isBranchAncestor(
	cwd: string,
	branch: string,
	base: string,
): Promise<Result<boolean>> {
	const result = await git(["merge-base", "--is-ancestor", branch, base], cwd)
	if (result.ok) return Result.ok(true)
	if (result.error.includes("Not a valid") || result.error.includes("unknown revision")) {
		return Result.ok(false)
	}
	return Result.ok(false)
}

// =============================================================================
// MERGE-BACK (APPLY)
// =============================================================================

export interface MergeReport {
	ok: boolean
	error?: string
	conflicts: string[]
	mergedCommits: number
}

/**
 * List files with unresolved merge conflicts.
 */
export async function listConflictedFiles(cwd: string): Promise<Result<string[]>> {
	const result = await git(["diff", "--name-only", "--diff-filter=U"], cwd)
	if (!result.ok) return result
	return Result.ok(result.value.split("\n").filter(Boolean))
}

/**
 * Resolve every unresolved conflict in favor of one side, staging the results.
 * The merge remains in progress — the caller finishes with a commit.
 */
export async function resolveConflicts(
	cwd: string,
	prefer: "ours" | "theirs",
): Promise<Result<string[]>> {
	const conflicts = await listConflictedFiles(cwd)
	if (!conflicts.ok) return conflicts
	if (conflicts.value.length === 0) return Result.ok([])

	for (const file of conflicts.value) {
		const checkout = await git(["checkout", `--${prefer}`, "--", file], cwd)
		if (!checkout.ok) return Result.err(checkout.error)
	}

	const addResult = await git(["add", "-A"], cwd)
	if (!addResult.ok) return Result.err(addResult.error)

	return Result.ok(conflicts.value)
}

/**
 * Abort an in-progress merge, discarding all merge state.
 */
export async function abortMerge(cwd: string): Promise<Result<void>> {
	const result = await git(["merge", "--abort"], cwd)
	return result.ok ? Result.ok(undefined) : Result.err(result.error)
}

/**
 * Merge a worktree branch into the current branch of the main checkout.
 * Surfaces conflicts as a file list; conflicted files are left for resolution.
 */
export async function mergeBranch(
	cwd: string,
	branch: string,
	noFF = false,
): Promise<MergeReport> {
	const args = ["merge", "--no-edit"]
	if (noFF) args.push("--no-ff")
	args.push(branch)
	const result = await git(args, cwd)
	if (result.ok) {
		return {
			ok: true,
			conflicts: [],
			mergedCommits: await countMergedCommits(cwd, branch),
		}
	}

	// Merge failed — determine whether it is a conflict or a hard error
	const conflictResult = await listConflictedFiles(cwd)
	if (conflictResult.ok && conflictResult.value.length > 0) {
		return {
			ok: true,
			conflicts: conflictResult.value,
			mergedCommits: 0,
		}
	}

	return {
		ok: false,
		error: result.error,
		conflicts: [],
		mergedCommits: 0,
	}
}

/**
 * Merge a worktree branch into the main branch, resolving every conflict in
 * favor of the worktree branch (overwrite semantics).
 */
export async function overwriteBranch(cwd: string, branch: string): Promise<MergeReport> {
	const result = await git(["merge", "--no-edit", "-X", "theirs", branch], cwd)
	if (result.ok) {
		return {
			ok: true,
			conflicts: [],
			mergedCommits: await countMergedCommits(cwd, branch),
		}
	}

	// -X theirs can still fail if a file is deleted in one branch and modified in the other
	const conflictResult = await listConflictedFiles(cwd)
	if (conflictResult.ok && conflictResult.value.length > 0) {
		return {
			ok: false,
			error: `Overwrite merge left conflicts that -X theirs cannot resolve: ${conflictResult.value.join(", ")}. Resolve manually in ${cwd}.`,
			conflicts: conflictResult.value,
			mergedCommits: 0,
		}
	}

	return {
		ok: false,
		error: result.error,
		conflicts: [],
		mergedCommits: 0,
	}
}

/**
 * Count commits brought in by the most recent merge (or fast-forward).
 * Compares the first parent (pre-merge state) with HEAD.
 */
async function countMergedCommits(cwd: string, _branch: string): Promise<number> {
	const result = await git(["rev-list", "--count", "HEAD^1..HEAD"], cwd)
	if (!result.ok) return 0
	const count = Number.parseInt(result.value, 10)
	return Number.isFinite(count) ? count : 0
}

/**
 * List files changed by the most recent merge (or fast-forward).
 */
export async function getChangedFiles(cwd: string): Promise<Result<string[]>> {
	const result = await git(["diff", "--name-only", "HEAD^1", "HEAD"], cwd)
	if (!result.ok) return result
	return Result.ok(result.value.split("\n").filter(Boolean))
}