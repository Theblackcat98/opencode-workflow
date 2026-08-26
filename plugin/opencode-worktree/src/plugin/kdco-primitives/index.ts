/**
 * Shared primitives for the worktree plugin.
 *
 * This module provides common utilities extracted from multiple plugin files
 * to eliminate duplication and ensure consistent behavior across plugins.
 *
 * @module kdco-primitives
 */

// Project identification
export { getProjectId } from "./get-project-id"

// Logging
export { logWarn } from "./log-warn"
// Types
export type { OpencodeClient } from "./types"
// Timeout handling
export { TimeoutError, withTimeout } from "./with-timeout"