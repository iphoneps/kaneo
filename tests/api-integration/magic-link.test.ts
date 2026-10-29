import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { drainSignInEmails } from "../../apps/api/src/utils/sign-in-email-tasks";
import { resetTestDatabase } from "./helpers/database";

const { sendMagicLinkEmail } = vi.hoisted(() => ({
  sendMagicLinkEmail: vi.fn(),
}));

vi.mock("@kaneo/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kaneo/email")>()),
  sendMagicLinkEmail,
}));

const origin = "http://localhost:5173";
const headers = {
  "content-type": "application/json",
  Origin: origin,
  Cookie: "csrf=1",
};

async function requestMagicLinkToken(
  app: ReturnType<typeof createApp>["app"],
  email: string,
): Promise<string> {
  const res = await app.request("/api/auth/sign-in/magic-link", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, callbackURL: `${origin}/` }),
  });
  expect(res.status).toBe(200);
  // Sign-in emails are queued so delivery time cannot reveal accounts.
  await expect(drainSignInEmails()).resolves.toBe(true);

  const data = sendMagicLinkEmail.mock.calls.at(-1)?.[2] as
    | { magicLink: string }
    | undefined;
  const token = data && new URL(data.magicLink).searchParams.get("token");
  expect(token).toEqual(expect.any(String));
  return token as string;
}

function sessionCookies(res: Response): string[] {
  return (res.headers.getSetCookie?.() ?? []).filter((cookie) =>
    cookie.includes("session_token="),
  );
}

describe("API integration: magic link tokens", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    sendMagicLinkEmail.mockClear();
  });

  it("stores the token hashed, so the plain value is not a lookup key", async () => {
    const { app } = createApp();
    const token = await requestMagicLinkToken(app, "hashed@example.com");

    const rows = await db
      .select()
      .from(schema.verificationTable)
      .where(eq(schema.verificationTable.identifier, token));
    expect(rows).toHaveLength(0);
  });

  it("still signs in with the emailed token", async () => {
    const { app } = createApp();
    const token = await requestMagicLinkToken(app, "verify@example.com");

    const res = await app.request(
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(`${origin}/`)}`,
      { headers },
    );

    expect(res.status).toBe(302);
    expect(sessionCookies(res)).not.toHaveLength(0);
  });

  it("does not accept a plain verification identifier as a magic link token", async () => {
    const { app } = createApp();
    const identifier = "plain-oauth-state-value";
    await db.insert(schema.verificationTable).values({
      identifier,
      value: JSON.stringify({ email: "victim@example.com", name: "Victim" }),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const res = await app.request(
      `/api/auth/magic-link/verify?token=${identifier}&callbackURL=${encodeURIComponent(`${origin}/`)}`,
      { headers },
    );

    expect(sessionCookies(res)).toHaveLength(0);
  });
});
