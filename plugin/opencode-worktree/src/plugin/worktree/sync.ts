/**
 * File Sync Module for the Worktree Plugin
 *
 * Copies files and symlinks directories from the main checkout into new
 * worktrees, with strict path-safety validation against traversal and
 * symlink escapes.
 */

import { access, lstat, mkdir, realpath, rm, stat, symlink } from "node:fs/promises"
import * as path from "node:path"
import type { Logger } from "./types"

/**
 * Check if a path exists, distinguishing ENOENT from other errors.
 */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath)
		return true
	} catch (e: unknown) {
		if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
			return false
		}
		throw e // Re-throw permission errors, etc.
	}
}

/**
 * Validate that a path is safe (no escape from base directory)
 */
function isPathSafe(filePath: string, baseDir: string, log: Logger): boolean {
	// Reject absolute paths
	if (path.isAbsolute(filePath)) {
		log.warn(`[worktree] Rejected absolute path: ${filePath}`)
		return false
	}
	// Reject obvious path traversal
	if (filePath.includes("..")) {
		log.warn(`[worktree] Rejected path traversal: ${filePath}`)
		return false
	}
	// Verify resolved path stays within base directory
	const resolved = path.resolve(baseDir, filePath)
	if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
		log.warn(`[worktree] Path escapes base directory: ${filePath}`)
		return false
	}
	return true
}

function isWithinRealRoot(rootRealPath: string, candidateRealPath: string): boolean {
	const relative = path.relative(rootRealPath, candidateRealPath)
	return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
}

async function resolveExistingPathWithinRoot(
	rootDir: string,
	relativePath: string,
	log: Logger,
): Promise<string | null> {
	const rootRealPath = await realpath(rootDir).catch(() => null)
	if (!rootRealPath) {
		log.warn(`[worktree] Failed to resolve worktree root: ${rootDir}`)
		return null
	}

	const candidatePath = path.resolve(rootDir, relativePath)
	const candidateRealPath = await realpath(candidatePath).catch(() => null)
	if (!candidateRealPath) return null

	if (!isWithinRealRoot(rootRealPath, candidateRealPath)) {
		log.warn(`[worktree] Rejected path escaping worktree via symlink: ${relativePath}`)
		return null
	}

	return candidateRealPath
}

async function ensureDirectoryWithinRoot(
	rootDir: string,
	relativeDir: string,
	log: Logger,
): Promise<string | null> {
	const rootRealPath = await realpath(rootDir).catch(() => null)
	if (!rootRealPath) {
		log.warn(`[worktree] Failed to resolve worktree root: ${rootDir}`)
		return null
	}

	const rootPath = path.resolve(rootDir)
	const targetDir = path.resolve(rootDir, relativeDir)
	const resolvedRootRelative = path.relative(rootPath, targetDir)
	if (
		resolvedRootRelative !== "" &&
		(resolvedRootRelative.startsWith("..") || path.isAbsolute(resolvedRootRelative))
	) {
		log.warn(`[worktree] Rejected path escaping worktree: ${relativeDir}`)
		return null
	}

	const rootRelative = path.relative(rootDir, targetDir)
	const parts = rootRelative.split(path.sep).filter(Boolean)
	let cursor = rootDir

	for (const part of parts) {
		cursor = path.join(cursor, part)
		const entry = await lstat(cursor).catch(() => null)
		if (entry?.isSymbolicLink()) {
			log.warn(`[worktree] Rejected symlinked target parent: ${relativeDir}`)
			return null
		}
		if (entry && !entry.isDirectory()) {
			log.warn(`[worktree] Rejected non-directory target parent: ${relativeDir}`)
			return null
		}
		if (!entry) {
			await mkdir(cursor)
		}
	}

	const finalRealPath = await realpath(targetDir).catch(() => null)
	if (!finalRealPath || !isWithinRealRoot(rootRealPath, finalRealPath)) {
		log.warn(`[worktree] Rejected path escaping worktree via symlink: ${relativeDir}`)
		return null
	}

	return targetDir
}

/**
 * Copy files from source directory to target directory.
 * Skips missing files silently.
 */
export async function copyFiles(
	sourceDir: string,
	targetDir: string,
	files: string[],
	log: Logger,
): Promise<void> {
	for (const file of files) {
		if (!isPathSafe(file, sourceDir, log)) continue

		const sourcePath = await resolveExistingPathWithinRoot(sourceDir, file, log)
		if (!sourcePath) continue

		const targetPath = path.join(targetDir, file)

		try {
			const sourceFile = Bun.file(sourcePath)
			if (!(await sourceFile.exists())) {
				log.debug(`[worktree] Skipping missing file: ${file}`)
				continue
			}

			// Ensure target directory exists
			const targetFileDir = path.dirname(targetPath)
			const targetFileRelativeDir = path.relative(targetDir, targetFileDir)
			if (!(await ensureDirectoryWithinRoot(targetDir, targetFileRelativeDir, log))) continue

			const existingTarget = await lstat(targetPath).catch(() => null)
			if (existingTarget?.isSymbolicLink()) {
				log.warn(`[worktree] Rejected symlinked target file: ${file}`)
				continue
			}

			// Copy file
			await Bun.write(targetPath, sourceFile)
			log.info(`[worktree] Copied: ${file}`)
		} catch (error) {
			const isNotFound =
				error instanceof Error &&
				(error.message.includes("ENOENT") || error.message.includes("no such file"))
			if (isNotFound) {
				log.debug(`[worktree] Skipping missing: ${file}`)
			} else {
				log.warn(`[worktree] Failed to copy ${file}: ${error}`)
			}
		}
	}
}

/**
 * Create symlinks for directories from source to target.
 * Uses absolute paths for symlink targets.
 */
export async function symlinkDirs(
	sourceDir: string,
	targetDir: string,
	dirs: string[],
	log: Logger,
): Promise<void> {
	for (const dir of dirs) {
		if (!isPathSafe(dir, sourceDir, log)) continue

		const sourcePath = await resolveExistingPathWithinRoot(sourceDir, dir, log)
		if (!sourcePath) continue

		const targetPath = path.join(targetDir, dir)

		try {
			// Check if source directory exists
			const fileStat = await stat(sourcePath).catch(() => null)
			if (!fileStat?.isDirectory()) {
				log.debug(`[worktree] Skipping missing directory: ${dir}`)
				continue
			}

			// Ensure parent directory exists
			const targetParentDir = path.dirname(targetPath)
			const targetParentRelativeDir = path.relative(targetDir, targetParentDir)
			if (!(await ensureDirectoryWithinRoot(targetDir, targetParentRelativeDir, log))) continue

			const existingTarget = await lstat(targetPath).catch(() => null)
			if (existingTarget?.isSymbolicLink()) {
				log.warn(`[worktree] Rejected symlinked target: ${dir}`)
				continue
			}

			// Remove existing target if it exists (might be empty dir from git)
			await rm(targetPath, { recursive: true, force: true })

			// Create symlink (use absolute path for source)
			await symlink(sourcePath, targetPath, "dir")
			log.info(`[worktree] Symlinked: ${dir}`)
		} catch (error) {
			log.warn(`[worktree] Failed to symlink ${dir}: ${error}`)
		}
	}
}

/**
 * Run hook commands in the worktree directory.
 */
export async function runHooks(cwd: string, commands: string[], log: Logger): Promise<void> {
	for (const command of commands) {
		log.info(`[worktree] Running hook: ${command}`)
		try {
			// Use shell to properly handle quoted arguments and complex commands
			const result = Bun.spawnSync(["bash", "-c", command], {
				cwd,
				stdout: "inherit",
				stderr: "pipe",
			})
			if (result.exitCode !== 0) {
				const stderr = result.stderr?.toString() || ""
				log.warn(
					`[worktree] Hook failed (exit ${result.exitCode}): ${command}${stderr ? `\n${stderr}` : ""}`,
				)
			}
		} catch (error) {
			log.warn(`[worktree] Hook error: ${error}`)
		}
	}
}