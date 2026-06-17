/**
 * Typed accessor for the D1 database binding.
 * Throws at runtime if the `DB` binding is not present in the environment,
 * surfacing misconfigured deployments before any query is attempted.
 */
export function getDB(env: Env): D1Database {
  if (!env.DB) {
    throw new Error(
      'D1 binding "DB" is not configured. Ensure wrangler.jsonc includes a d1_databases entry with binding "DB".'
    );
  }
  return env.DB;
}
