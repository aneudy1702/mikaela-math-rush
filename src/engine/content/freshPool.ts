/**
 * Skip instances already shown in this pass when another instance is still available.
 * An empty result falls back to the full pool so a small catalog can repeat.
 */
export function poolWithoutShown<T>(
  pool: readonly T[],
  instanceKey: (item: T) => string,
  exclude: readonly string[] | undefined,
): readonly T[] {
  if (!exclude || exclude.length === 0 || pool.length <= 1) return pool
  const shown = new Set(exclude)
  const fresh = pool.filter((item) => !shown.has(instanceKey(item)))
  return fresh.length > 0 ? fresh : pool
}
