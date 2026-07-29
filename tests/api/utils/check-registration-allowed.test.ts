import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above the imports, so the mock has to be created with
// `vi.hoisted` rather than a plain top-level const.
const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("../../../apps/api/src/database", () => ({
  default: { select: selectMock },
}));

import { checkRegistrationAllowed } from "../../../apps/api/src/utils/check-registration-allowed";

const INVITATION_ROW = {
  id: "inv_123",
  email: "kate@example.com",
  workspaceId: "ws_1",
  workspaceName: "IPS Media",
  inviterName: "Admin",
  expiresAt: new Date("2099-01-01"),
  status: "pending",
};

/**
 * Stands in for `db.select().from().innerJoin().innerJoin().where().limit()`.
 * Returns `rows` and records the query so tests can assert it was even issued —
 * the important cases here are the ones that must short-circuit before it.
 */
function mockSelect(rows: unknown[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  selectMock.mockReturnValue(chain);
}

describe("checkRegistrationAllowed", () => {
  const originalFlag = process.env.DISABLE_REGISTRATION;

  beforeEach(() => {
    selectMock.mockReset();
    process.env.DISABLE_REGISTRATION = "true";
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      process.env.DISABLE_REGISTRATION = undefined;
      delete process.env.DISABLE_REGISTRATION;
    } else {
      process.env.DISABLE_REGISTRATION = originalFlag;
    }
  });

  it("allows anyone when registration is enabled", async () => {
    process.env.DISABLE_REGISTRATION = "false";

    const result = await checkRegistrationAllowed("nobody@example.com");

    expect(result.allowed).toBe(true);
    expect(selectMock).not.toHaveBeenCalled();
  });

  describe("when registration is disabled", () => {
    it("rejects a signup with neither invitation id nor trusted email", async () => {
      const result = await checkRegistrationAllowed();

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/valid invitation link/);
      expect(selectMock).not.toHaveBeenCalled();
    });

    // The regression this guards: a password signup supplies whatever email it
    // likes, so matching an invitation on email alone would let anyone who knows
    // an invited address register as that person.
    it("rejects an email-only signup when the email is not trusted", async () => {
      mockSelect([INVITATION_ROW]);

      const result = await checkRegistrationAllowed("kate@example.com");

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/valid invitation link/);
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("rejects an email-only signup when allowEmailMatch is explicitly false", async () => {
      mockSelect([INVITATION_ROW]);

      const result = await checkRegistrationAllowed(
        "kate@example.com",
        undefined,
        { allowEmailMatch: false },
      );

      expect(result.allowed).toBe(false);
      expect(selectMock).not.toHaveBeenCalled();
    });

    // The fix: an OAuth callback carries no invitation id, so a provider-verified
    // email is the only thing that can match the pending invitation.
    it("allows a trusted email match with no invitation id", async () => {
      mockSelect([INVITATION_ROW]);

      const result = await checkRegistrationAllowed(
        "kate@example.com",
        undefined,
        { allowEmailMatch: true },
      );

      expect(result.allowed).toBe(true);
      expect(result.invitation).toEqual(INVITATION_ROW);
    });

    it("rejects a trusted email with no matching invitation", async () => {
      mockSelect([]);

      const result = await checkRegistrationAllowed(
        "stranger@example.com",
        undefined,
        { allowEmailMatch: true },
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/need a valid invitation/);
    });

    it("does not allow a trusted match when the email is missing", async () => {
      mockSelect([INVITATION_ROW]);

      const result = await checkRegistrationAllowed(undefined, undefined, {
        allowEmailMatch: true,
      });

      expect(result.allowed).toBe(false);
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("still allows the invitation-id path without a trusted email", async () => {
      mockSelect([INVITATION_ROW]);

      const result = await checkRegistrationAllowed(
        "kate@example.com",
        "inv_123",
      );

      expect(result.allowed).toBe(true);
      expect(result.invitation).toEqual(INVITATION_ROW);
    });

    it("rejects an invitation id that matches nothing", async () => {
      mockSelect([]);

      const result = await checkRegistrationAllowed(
        "kate@example.com",
        "inv_expired",
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/need a valid invitation/);
    });
  });
});
