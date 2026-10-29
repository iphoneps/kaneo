import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";

const origin = "http://localhost:5173";

type App = ReturnType<typeof createApp>["app"];

function mergeCookieJar(cookieJar: string, res: Response): string {
  const pairs = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .filter(Boolean);
  if (pairs.length === 0) return cookieJar;
  return [cookieJar, ...pairs].filter(Boolean).join("; ");
}

async function signUp(app: App, email: string): Promise<string> {
  const password = "team-counter-password-12345";
  const signUpRes = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      Cookie: "csrf=1",
    },
    body: JSON.stringify({ name: "Team counter user", email, password }),
  });
  expect(signUpRes.status).toBe(200);
  const jar = mergeCookieJar("csrf=1", signUpRes);

  const signInRes = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      Cookie: jar,
    },
    body: JSON.stringify({ email, password }),
  });
  expect(signInRes.status).toBe(200);
  return mergeCookieJar(jar, signInRes);
}

async function postAuth(
  app: App,
  path: string,
  cookie: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

async function createUserInWorkspace(workspaceId: string) {
  const userId = `user-${randomUUID()}`;
  await db.insert(schema.userTable).values({
    id: userId,
    name: "Team member",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId,
    role: "member",
    joinedAt: new Date(),
  });
  return userId;
}

async function getTeam(teamId: string) {
  const [team] = await db
    .select()
    .from(schema.teamTable)
    .where(eq(schema.teamTable.id, teamId));
  return team;
}

async function countTeamMembers(teamId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(schema.teamMemberTable)
    .where(eq(schema.teamMemberTable.teamId, teamId));
  return row?.value ?? 0;
}

describe("API integration: team member counter (better-auth 1.7)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps team.member_count and team_member.membership_key in step with memberships", async () => {
    const { app } = createApp();
    const ownerCookie = await signUp(
      app,
      `team-owner-${randomUUID()}@example.com`,
    );

    const createRes = await postAuth(app, "/organization/create", ownerCookie, {
      name: "Team counter workspace",
      slug: `team-counter-${randomUUID()}`,
    });
    expect(createRes.status).toBe(200);
    const workspace = (await createRes.json()) as { id: string };

    // Teams are enabled, so the workspace gets a default team that contains
    // the creator.
    const [defaultTeam] = await db
      .select()
      .from(schema.teamTable)
      .where(eq(schema.teamTable.workspaceId, workspace.id));
    expect(defaultTeam).toBeDefined();
    const teamId = defaultTeam.id;
    expect(defaultTeam.memberCount).toBe(1);

    const [ownerMembership] = await db
      .select()
      .from(schema.teamMemberTable)
      .where(eq(schema.teamMemberTable.teamId, teamId));
    expect(ownerMembership.membershipKey).toEqual(expect.any(String));

    const memberId = await createUserInWorkspace(workspace.id);
    const addRes = await postAuth(
      app,
      "/organization/add-team-member",
      ownerCookie,
      {
        teamId,
        userId: memberId,
        organizationId: workspace.id,
      },
    );
    expect(addRes.status).toBe(200);
    expect(await addRes.json()).not.toHaveProperty("membershipKey");
    expect((await getTeam(teamId)).memberCount).toBe(2);

    // Adding the same user again must not create a second row or count twice.
    const addAgainRes = await postAuth(
      app,
      "/organization/add-team-member",
      ownerCookie,
      { teamId, userId: memberId, organizationId: workspace.id },
    );
    expect(addAgainRes.status).toBe(200);
    expect(await countTeamMembers(teamId)).toBe(2);
    expect((await getTeam(teamId)).memberCount).toBe(2);

    // A membership created before 1.7 has no key and was never counted. The
    // next add resyncs the counter from the real rows.
    const legacyMemberId = await createUserInWorkspace(workspace.id);
    await db.insert(schema.teamMemberTable).values({
      id: `team-member-${randomUUID()}`,
      teamId,
      userId: legacyMemberId,
      createdAt: new Date(),
    });
    const lateMemberId = await createUserInWorkspace(workspace.id);
    const lateAddRes = await postAuth(
      app,
      "/organization/add-team-member",
      ownerCookie,
      { teamId, userId: lateMemberId, organizationId: workspace.id },
    );
    expect(lateAddRes.status).toBe(200);
    expect(await countTeamMembers(teamId)).toBe(4);
    expect((await getTeam(teamId)).memberCount).toBe(4);

    const removeRes = await postAuth(
      app,
      "/organization/remove-team-member",
      ownerCookie,
      { teamId, userId: memberId, organizationId: workspace.id },
    );
    expect(removeRes.status).toBe(200);
    expect(await countTeamMembers(teamId)).toBe(3);
    expect((await getTeam(teamId)).memberCount).toBe(3);
  });
});
