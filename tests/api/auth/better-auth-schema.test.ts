import { describe, expect, it } from "vitest";
import { auth } from "../../../apps/api/src/auth";

describe("better-auth Drizzle schema", () => {
  // better-auth >= 1.7.3 runs this check at startup and rejects every auth
  // request when the Drizzle schema is missing a column it writes (or has a
  // required column it never writes). It only reads the schema object, so it
  // runs without a database.
  it("has every table and column better-auth writes", async () => {
    const context = await auth.$context;

    expect(context.explicitSchemaCheck).toBeTypeOf("function");
    // The check returns nothing once the schema is known to be clean, and a
    // rejected promise carrying a SchemaMismatchError otherwise.
    await expect(
      Promise.resolve(context.explicitSchemaCheck?.()),
    ).resolves.toBeUndefined();
  });
});
