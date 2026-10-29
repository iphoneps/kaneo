import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import db from "../../apps/api/src/database";
import {
  FORK_MIGRATION,
  reconcileForkMigrationHistory,
} from "../../apps/api/src/database/reconcile-fork-migration-history";
import { getClient } from "../../apps/api/src/mcp/oauth";
import { resetTestDatabase } from "./helpers/database";

const currentDir = dirname(fileURLToPath(import.meta.url));
const copyClientsSql = readFileSync(
  resolve(
    currentDir,
    "../../apps/api/drizzle/0073_migrate_mcp_oauth_clients.sql",
  ),
  "utf8",
);

const historySchema = "fork_history_check";
const upstream0034 = 1785240609705;

async function recordedMigrations() {
  const result = await db.execute<{ hash: string; created_at: string }>(
    sql.raw(
      `SELECT hash, created_at FROM ${historySchema}.__drizzle_migrations ORDER BY created_at`,
    ),
  );
  return result.rows.map((row) => Number(row.created_at));
}

describe("API integration: fork migration history", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${historySchema} CASCADE`));
    await db.execute(sql.raw(`CREATE SCHEMA ${historySchema}`));
    await db.execute(
      sql.raw(
        `CREATE TABLE ${historySchema}.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
      ),
    );
    await db.execute(
      sql`INSERT INTO ${sql.identifier(historySchema)}.__drizzle_migrations (hash, created_at) VALUES ('upstream-0034', ${upstream0034}), (${FORK_MIGRATION.hash}, ${FORK_MIGRATION.createdAt})`,
    );
  });

  afterEach(async () => {
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${historySchema} CASCADE`));
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "mcp_oauth_client"`));
  });

  it("removes the fork record while it is the newest, once", async () => {
    await expect(
      reconcileForkMigrationHistory(db, historySchema),
    ).resolves.toBe(true);
    expect(await recordedMigrations()).toEqual([upstream0034]);

    await expect(
      reconcileForkMigrationHistory(db, historySchema),
    ).resolves.toBe(false);
    expect(await recordedMigrations()).toEqual([upstream0034]);
  });

  it("keeps the fork record once newer migrations are recorded", async () => {
    await db.execute(
      sql`INSERT INTO ${sql.identifier(historySchema)}.__drizzle_migrations (hash, created_at) VALUES ('upstream-0046', 1789848584765)`,
    );

    await expect(
      reconcileForkMigrationHistory(db, historySchema),
    ).resolves.toBe(false);
    expect(await recordedMigrations()).toEqual([
      upstream0034,
      FORK_MIGRATION.createdAt,
      1789848584765,
    ]);
  });

  it("copies fork-registered MCP clients into the OAuth state store", async () => {
    await db.execute(
      sql.raw(`CREATE TABLE "mcp_oauth_client" (
        "client_id" text PRIMARY KEY NOT NULL,
        "redirect_uris" jsonb NOT NULL,
        "client_name" text,
        "issued_at" timestamp DEFAULT now() NOT NULL
      )`),
    );
    await db.execute(
      sql.raw(`INSERT INTO "mcp_oauth_client" VALUES
        ('client-named', '["http://localhost:9999/callback"]', 'Claude Code', '2026-08-27 07:56:36.476'),
        ('client-unnamed', '["claude://claude.ai/mcp-auth-callback/sdk"]', NULL, '2026-10-28 09:23:58.601')`),
    );

    await db.execute(sql.raw(copyClientsSql));
    await db.execute(sql.raw(copyClientsSql));

    await expect(getClient("client-named")).resolves.toEqual({
      clientId: "client-named",
      redirectUris: ["http://localhost:9999/callback"],
      clientName: "Claude Code",
      issuedAt: 1787817396,
    });
    await expect(getClient("client-unnamed")).resolves.toEqual({
      clientId: "client-unnamed",
      redirectUris: ["claude://claude.ai/mcp-auth-callback/sdk"],
      issuedAt: 1793179438,
    });

    const states = await db.execute<{ total: string }>(
      sql`SELECT count(*) AS total FROM mcp_oauth_state WHERE kind = 'client'`,
    );
    expect(Number(states.rows[0]?.total)).toBe(2);
  });

  it("does nothing on databases without the fork table", async () => {
    await db.execute(sql.raw(copyClientsSql));

    const states = await db.execute<{ total: string }>(
      sql`SELECT count(*) AS total FROM mcp_oauth_state`,
    );
    expect(Number(states.rows[0]?.total)).toBe(0);
  });
});
