/**
 * Per-page async mutex.
 *
 * Why this exists: when two concurrent ingests both produce a page
 * with the same path (e.g. both source A and source B contribute to
 * wiki/entities/attention.md), they must not race the read→merge→write
 * cycle. Without a per-page lock, the second ingest would read the
 * pre-A version, merge against it, and overwrite A's contribution.
 *
 * Pattern is identical to project-mutex.ts: a simple promise chain
 * keyed by page file path. No timeouts, no fairness detection.
 */

const locks = new Map<string, Promise<unknown>>()

/**
 * Run `fn` while holding the per-`pagePath` lock. Returns the value
 * `fn` resolves to. If `fn` throws, the lock is released and the
 * rejection is propagated.
 */
export async function withPageLock<T>(
  pagePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(pagePath) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  locks.set(
    pagePath,
    prev.then(() => next),
  )
  try {
    await prev.catch(() => {})
    return await fn()
  } finally {
    release()
    if (locks.get(pagePath) === next || locks.size > 1024) {
      const tail = locks.get(pagePath)
      if (tail) {
        Promise.resolve().then(() => {
          if (locks.get(pagePath) === tail) {
            locks.delete(pagePath)
          }
        })
      }
    }
  }
}

/** Test-only — drop all live locks. */
export function __resetPageLocksForTesting(): void {
  locks.clear()
}
