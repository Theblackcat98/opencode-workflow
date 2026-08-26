/**
 * SQLite State Module for the Worktree Plugin
 *
 * Provides atomic, crash-safe persistence for the worktree registry.
 * Uses bun:sqlite for zero external dependencies.
 *
 * Database location: ~/.local/share/opencode/plugins/worktree/{project-id}.sqlite
 * Project ID is the first git root commit SHA (40-char hex), with SHA-256 path hash fallback (16-char).
 */

import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { z } from "zod"
import { getProjectId } from "../kdco-primitives"

// =============================================================================
// TYPES
// =============================================================================

/** Represents a registered worktree */
export interface WorktreeRecord {
	branch: string
	path: string
	baseBranch: string | null
	createdAt: string
}

export type WorktreeInput = Omit<WorktreeRecord, "createdAt"> & {
	createdAt?: string
}

// =============================================================================
// SCHEMAS (Boundary Validation)
// =============================================================================

const worktreeSchema = z.object({
	branch: z.string().min(1),
	path: z.string().min(1),
	baseBranch: z.string().nullable().optional(),
	createdAt: z.string().min(1).optional(),
})

// =============================================================================
// DATABASE UTILITIES
// =============================================================================

/**
 * Get the default base directory for worktree storage.
 * Location: ~/.local/share/opencode/worktree/
 */
function getWorktreeBaseDirectory(): string {
	return path.join(os.homedir(), ".local", "share", "opencode", "worktree")
}

/**
 * Get the worktree path for a given project and branch.
 *
 * @param projectRoot - Absolute path to the project root
 * @param branch - Branch name for the worktree
 * @param basePath - Optional custom base path (absolute). Defaults to ~/.local/share/opencode/worktree
 * @returns Absolute path to the worktree directory
 */
export async function getWorktreePath(
	projectRoot: string,
	branch: string,
	basePath?: string,
): Promise<string> {
	if (!branch || typeof branch !== "string") {
		throw new Error("branch is required")
	}
	const projectId = await getProjectId(projectRoot)
	return path.join(basePath ?? getWorktreeBaseDirectory(), projectId, branch)
}

/**
 * Get the database directory path.
 * Location: ~/.local/share/opencode/plugins/worktree/
 */
function getDbDirectory(): string {
	const home = os.homedir()
	return path.join(home, ".local", "share", "opencode", "plugins", "worktree")
}

/**
 * Get the full database file path for a project.
 * @param projectRoot - Absolute path to the project root
 */
async function getDbPath(projectRoot: string): Promise<string> {
	const projectId = await getProjectId(projectRoot)
	return path.join(getDbDirectory(), `${projectId}.sqlite`)
}

/**
 * Initialize the SQLite database for worktree state.
 * Creates the database file and schema if they don't exist.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Configured Database instance
 */
export async function initStateDb(projectRoot: string): Promise<Database> {
	// Guard: validate project root
	if (!projectRoot || typeof projectRoot !== "string") {
		throw new Error("initStateDb requires a valid project root path")
	}

	const dbPath = await getDbPath(projectRoot)
	const dbDir = path.dirname(dbPath)

	// Create directory synchronously (required before opening DB)
	mkdirSync(dbDir, { recursive: true })

	// Open database (creates if doesn't exist)
	const db = new Database(dbPath)

	// Configure SQLite for concurrent access
	db.exec("PRAGMA journal_mode=WAL")
	db.exec("PRAGMA busy_timeout=5000")

	// Create tables with schema
	db.exec(`
		CREATE TABLE IF NOT EXISTS worktrees (
			branch TEXT PRIMARY KEY,
			path TEXT NOT NULL,
			base_branch TEXT,
			created_at TEXT NOT NULL
		)
	`)

	return db
}

function normalizeWorktreeRow(row: Record<string, string | null>): WorktreeRecord {
	return {
		branch: String(row.branch),
		path: String(row.path),
		baseBranch: row.baseBranch ?? null,
		createdAt: String(row.createdAt),
	}
}

// =============================================================================
// WORKTREE CRUD
// =============================================================================

/**
 * Register a worktree in the database.
 * Uses atomic INSERT OR REPLACE for idempotency.
 *
 * @param db - Database instance from initStateDb
 * @param worktree - Worktree data to persist
 */
export function registerWorktree(db: Database, worktree: WorktreeInput): void {
	// Parse at boundary for type safety
	const parsed = worktreeSchema.parse(worktree)

	const stmt = db.prepare(`
		INSERT OR REPLACE INTO worktrees (branch, path, base_branch, created_at)
		VALUES ($branch, $path, $baseBranch, $createdAt)
	`)

	stmt.run({
		$branch: parsed.branch,
		$path: parsed.path,
		$baseBranch: parsed.baseBranch ?? null,
		$createdAt: parsed.createdAt ?? new Date().toISOString(),
	})
}

/**
 * Get a worktree by branch name.
 *
 * @param db - Database instance from initStateDb
 * @param branch - Branch name to look up
 * @returns Worktree if found, null otherwise
 */
export function getWorktree(db: Database, branch: string): WorktreeRecord | null {
	// Guard: empty branch
	if (!branch) return null

	const stmt = db.prepare(`
		SELECT branch, path, base_branch as baseBranch, created_at as createdAt
		FROM worktrees
		WHERE branch = $branch
	`)

	const row = stmt.get({ $branch: branch }) as Record<string, string | null> | null
	if (!row) return null

	return normalizeWorktreeRow(row)
}

/**
 * Unregister a worktree by branch name.
 *
 * @param db - Database instance from initStateDb
 * @param branch - Branch name to remove
 */
export function unregisterWorktree(db: Database, branch: string): void {
	// Guard: empty branch
	if (!branch) return

	const stmt = db.prepare(`DELETE FROM worktrees WHERE branch = $branch`)
	stmt.run({ $branch: branch })
}

/**
 * Get all registered worktrees.
 *
 * @param db - Database instance from initStateDb
 * @returns Array of all worktrees, empty if none
 */
export function getAllWorktrees(db: Database): WorktreeRecord[] {
	const stmt = db.prepare(`
		SELECT branch, path, base_branch as baseBranch, created_at as createdAt
		FROM worktrees
		ORDER BY created_at ASC
	`)

	const rows = stmt.all() as Array<Record<string, string | null>>
	return rows.map((row) => normalizeWorktreeRow(row))
}

/**
 * Find a registered worktree by its path (exact or resolved match).
 *
 * @param db - Database instance from initStateDb
 * @param worktreePath - Absolute path to look up
 * @returns Worktree if found, null otherwise
 */
export function getWorktreeByPath(db: Database, worktreePath: string): WorktreeRecord | null {
	// Guard: empty path
	if (!worktreePath) return null

	for (const record of getAllWorktrees(db)) {
		if (path.resolve(record.path) === path.resolve(worktreePath)) {
			return record
		}
	}

	return null
}