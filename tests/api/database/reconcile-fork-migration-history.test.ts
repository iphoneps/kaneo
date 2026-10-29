import { createHash } from "node:crypto";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vite-plus/test";
import {
  FORK_MIGRATION,
  reconcileForkMigrationHistory,
} from "../../../apps/api/src/database/reconcile-fork-migration-history";

// Exact contents of the fork's apps/api/drizzle/0035_persist_mcp_oauth_clients.sql.
const forkMigrationSql = `CREATE TABLE "mcp_oauth_client" (
\t"client_id" text PRIMARY KEY NOT NULL,
\t"redirect_uris" jsonb NOT NULL,
\t"client_name" text,
\t"issued_at" timestamp DEFAULT now() NOT NULL
);
`;

const dialect = new PgDialect();

function fakeDatabase(tableExists: boolean, deleted: number) {
  const queries: string[] = [];
  return {
    queries,
    async execute(query: SQL) {
      const { sql } = dialect.sqlToQuery(query);
      queries.push(sql);
      if (sql.startsWith("SELECT to_regclass")) {
        return { rows: [{ exists: tableExists }] };
      }
      return { rows: [], rowCount: deleted };
    },
  };
}

describe("reconcileForkMigrationHistory", () => {
  it("matches the hash drizzle recorded for the fork migration", () => {
    expect(createHash("sha256").update(forkMigrationSql).digest("hex")).toBe(
      FORK_MIGRATION.hash,
    );
  });

  it("does nothing before drizzle has created its migrations table", async () => {
    const database = fakeDatabase(false, 0);

    await expect(reconcileForkMigrationHistory(database)).resolves.toBe(false);
    expect(database.queries).toHaveLength(1);
  });

  it("deletes only the fork record, and only while it is the newest", async () => {
    const database = fakeDatabase(true, 1);

    await expect(reconcileForkMigrationHistory(database)).resolves.toBe(true);
    const [, deleteQuery] = database.queries;
    expect(deleteQuery).toContain(
      'DELETE FROM "drizzle"."__drizzle_migrations"',
    );
    expect(deleteQuery).toContain("NOT EXISTS");
  });

  it("reports false when there is nothing left to remove", async () => {
    await expect(
      reconcileForkMigrationHistory(fakeDatabase(true, 0)),
    ).resolves.toBe(false);
  });
});
