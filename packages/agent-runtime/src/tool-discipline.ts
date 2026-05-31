// Shared read-discipline guidance reused across executing/advisory agents.
// Lives in its own module so both workers.ts and review.ts can import it without
// creating an import cycle (workers.ts already imports from review.ts).

// The primary used to be the only agent told to batch reads / read whole files /
// search first / not re-read; support workers, the review agent, and dispatched
// specialists now reuse the same text so read behaviour is consistent across
// every executing context.
export const READ_TOOL_DISCIPLINE =
  "Issue independent read-only calls (read_file, search_files, list_files, git_diff) together in one turn so they run in parallel instead of one at a time. Read whole files rather than paging through small windows, search before reading to find the right files, and do not re-read or re-search the same target you already have this run."

// Tool-access block for read-only/advisory agents (support workers, review,
// dispatched specialists). They never edit or execute, so it pairs the
// read-only constraint with the shared read discipline above.
export function formatReadOnlyToolAccess(): string {
  return `Tool access:\nRead-only project tools may be available. Use them to gather concrete evidence and verify claims against the real files, but do not attempt edits, shell execution, package scripts, or other state-changing actions. ${READ_TOOL_DISCIPLINE}`
}
