import { type SQL, sql } from "drizzle-orm";

/**
 * The iphoneps fork recorded its own `0035_persist_mcp_oauth_clients`
 * migration (journal date 2026-08-27) before it took upstream's 0035–0045,
 * which are dated earlier. Drizzle only applies journal entries dated after
 * the newest recorded row, so while that row is the newest one every upstream
 * migration dated before it would be skipped without an error.
 *
 * Removing the row lets `migrate()` apply upstream's history in order. The
 * table it created is left in place; `0073_migrate_mcp_oauth_clients` copies
 * its rows into `mcp_oauth_state`.
 */
export const FORK_MIGRATION = {
  tag: "0035_persist_mcp_oauth_clients",
  // sha256 of the migration file, the way drizzle hashes it.
  hash: "b5e17b2ca2dbdaeba994cfb051eb57e5f4e4d3ff5ba01d215128f97f6301baa4",
  createdAt: 1787816979904,
} as const;

type Executor = {
  execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

/** Returns true when the fork's migration record was removed. */
export async function reconcileForkMigrationHistory(
  database: Executor,
  migrationsSchema = "drizzle",
): Promise<boolean> {
  const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier("__drizzle_migrations")}`;
  const lookup = await database.execute(
    sql`SELECT to_regclass(${`${migrationsSchema}.__drizzle_migrations`}) IS NOT NULL AS "exists"`,
  );
  const [row] = lookup.rows as { exists?: boolean | string }[];
  if (row?.exists !== true && row?.exists !== "t") return false;

  // Only while it is still the newest record: once upstream's later
  // migrations are recorded, drizzle no longer reads it.
  const result = await database.execute(sql`
    DELETE FROM ${table} AS fork
    WHERE fork.hash = ${FORK_MIGRATION.hash}
      AND fork.created_at = ${FORK_MIGRATION.createdAt}
      AND NOT EXISTS (
        SELECT 1 FROM ${table} AS newer
        WHERE newer.created_at > fork.created_at
      )
  `);
  return (result.rowCount ?? 0) > 0;
}
