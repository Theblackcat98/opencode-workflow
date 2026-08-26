/**
 * Configuration Module for the Worktree Plugin
 *
 * Loads .opencode/worktree.jsonc with auto-created defaults on first use.
 */

import * as os from "node:os"
import * as path from "node:path"
import { mkdir } from "node:fs/promises"
import { parse as parseJsonc } from "jsonc-parser"
import { z } from "zod"
import type { Logger } from "./types"

/**
 * Worktree plugin configuration schema.
 * Config file: .opencode/worktree.jsonc
 */
const worktreeConfigSchema = z.object({
	/** Custom base path for worktree storage. Supports ~ for home directory. */
	worktreePath: z.string().optional(),
	sync: z
		.object({
			/** Files to copy from main worktree (relative paths only) */
			copyFiles: z.array(z.string()).default([]),
			/** Directories to symlink from main worktree (saves disk space) */
			symlinkDirs: z.array(z.string()).default([]),
			/** Patterns to exclude from copying (reserved for future use) */
			exclude: z.array(z.string()).default([]),
		})
		.default(() => ({ copyFiles: [], symlinkDirs: [], exclude: [] })),
	hooks: z
		.object({
			/** Commands to run after worktree creation */
			postCreate: z.array(z.string()).default([]),
			/** Commands to run before worktree deletion */
			preDelete: z.array(z.string()).default([]),
		})
		.default(() => ({ postCreate: [], preDelete: [] })),
	gc: z
		.object({
			/** Enable automatic pruning of stale worktrees */
			enabled: z.boolean().default(true),
			/** Prune worktrees older than this many days */
			maxAgeDays: z.number().int().positive().default(30),
			/** Only prune worktrees whose branch is merged into its base branch */
			onlyIfMerged: z.boolean().default(true),
		})
		.default(() => ({ enabled: true, maxAgeDays: 30, onlyIfMerged: true })),
})

export type WorktreeConfig = z.infer<typeof worktreeConfigSchema>

/**
 * Resolve a path that may contain a leading `~` to the user's home directory.
 */
function resolveHomePath(p: string): string {
	if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
		return path.join(os.homedir(), p.slice(1))
	}
	return p
}

/**
 * Load worktree-specific configuration from .opencode/worktree.jsonc
 * Auto-creates config file with helpful defaults if it doesn't exist.
 */
export async function loadWorktreeConfig(directory: string, log: Logger): Promise<WorktreeConfig> {
	const configPath = path.join(directory, ".opencode", "worktree.jsonc")

	try {
		const file = Bun.file(configPath)
		if (!(await file.exists())) {
			// Auto-create config with helpful defaults and comments
			const defaultConfig = `{
  // Worktree plugin configuration

  // Custom base path for worktree storage (supports ~)
  // Default: ~/.local/share/opencode/worktree
  // "worktreePath": "~/my-worktrees",

  "sync": {
    // Files to copy from main worktree to new worktrees
    // Example: [".env", ".env.local", "dev.sqlite"]
    "copyFiles": [],

    // Directories to symlink (saves disk space)
    // Example: ["node_modules"]
    "symlinkDirs": [],

    // Patterns to exclude from copying
    "exclude": []
  },

  "hooks": {
    // Commands to run after worktree creation
    // Example: ["pnpm install", "docker compose up -d"]
    "postCreate": [],

    // Commands to run before worktree deletion
    // Example: ["docker compose down"]
    "preDelete": []
  },

  "gc": {
    // Enable automatic pruning of stale worktrees
    "enabled": true,

    // Prune worktrees older than this many days
    "maxAgeDays": 30,

    // Only prune worktrees whose branch is merged into its base branch
    "onlyIfMerged": true
  }
}
`
			// Ensure .opencode directory exists
			await mkdir(path.join(directory, ".opencode"), { recursive: true })
			await Bun.write(configPath, defaultConfig)
			log.info(`[worktree] Created default config: ${configPath}`)
			return worktreeConfigSchema.parse({})
		}

		const content = await file.text()
		// Use proper JSONC parser (handles comments in strings correctly)
		const parsed = parseJsonc(content)
		if (parsed === undefined) {
			log.error(`[worktree] Invalid worktree.jsonc syntax`)
			return worktreeConfigSchema.parse({})
		}
		const config = worktreeConfigSchema.parse(parsed)
		if (config.worktreePath) {
			config.worktreePath = resolveHomePath(config.worktreePath)
		}
		return config
	} catch (error) {
		log.warn(`[worktree] Failed to load config: ${error}`)
		return worktreeConfigSchema.parse({})
	}
}