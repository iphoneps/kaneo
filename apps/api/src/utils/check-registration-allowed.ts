import { and, eq, gt } from "drizzle-orm";
import db from "../database";
import { invitationTable, userTable, workspaceTable } from "../database/schema";

type RegistrationCheckResult = {
  allowed: boolean;
  reason: string;
  invitation?: {
    id: string;
    email: string;
    workspaceId: string;
    workspaceName: string;
    inviterName: string;
    expiresAt: Date;
    status: string;
  };
};

type RegistrationCheckOptions = {
  /**
   * Allow a pending invitation to be matched on `email` alone, without an
   * `invitationId`.
   *
   * Only pass `true` when the email has been verified by a trusted identity
   * provider. A password signup lets the caller choose any email they like, so
   * matching on email there would let anyone who knows an invited address
   * register as that person and accept their invitation.
   *
   * See the call site in `auth.ts` for why OAuth signups need this.
   */
  allowEmailMatch?: boolean;
};

export async function checkRegistrationAllowed(
  email?: string,
  invitationId?: string,
  { allowEmailMatch = false }: RegistrationCheckOptions = {},
): Promise<RegistrationCheckResult> {
  const isRegistrationDisabled = process.env.DISABLE_REGISTRATION === "true";

  if (!isRegistrationDisabled) {
    return {
      allowed: true,
      reason: "Registration is enabled",
    };
  }

  const canMatchByEmail = allowEmailMatch && Boolean(email);

  if (!invitationId && !canMatchByEmail) {
    return {
      allowed: false,
      reason:
        "Registration is currently disabled. Please use a valid invitation link to create an account.",
    };
  }

  const invitation = await findValidInvitation(email, invitationId, {
    allowEmailMatch: canMatchByEmail,
  });

  if (!invitation) {
    return {
      allowed: false,
      reason:
        "Registration is currently disabled. You need a valid invitation to create an account.",
    };
  }

  return {
    allowed: true,
    reason: "Valid invitation found",
    invitation,
  };
}

async function findValidInvitation(
  email?: string,
  invitationId?: string,
  { allowEmailMatch = false }: RegistrationCheckOptions = {},
): Promise<RegistrationCheckResult["invitation"] | null> {
  const now = new Date();

  const conditions = [
    eq(invitationTable.status, "pending"),
    gt(invitationTable.expiresAt, now),
  ];

  if (invitationId) {
    conditions.push(eq(invitationTable.id, invitationId));
  }

  if (email) {
    conditions.push(eq(invitationTable.email, email.toLowerCase()));
  }

  // Without an invitationId the email is the only thing narrowing this query,
  // so it must be both present and trusted.
  if (!invitationId && !(allowEmailMatch && email)) {
    return null;
  }

  const result = await db
    .select({
      id: invitationTable.id,
      email: invitationTable.email,
      workspaceId: invitationTable.workspaceId,
      workspaceName: workspaceTable.name,
      inviterName: userTable.name,
      expiresAt: invitationTable.expiresAt,
      status: invitationTable.status,
    })
    .from(invitationTable)
    .innerJoin(
      workspaceTable,
      eq(invitationTable.workspaceId, workspaceTable.id),
    )
    .innerJoin(userTable, eq(invitationTable.inviterId, userTable.id))
    .where(and(...conditions))
    .limit(1);

  const row = result[0];
  if (!row) {
    return null;
  }

  return row;
}

type InvitationDetails = {
  id: string;
  email: string;
  workspaceName: string;
  inviterName: string;
  expiresAt: Date;
  status: string;
  expired: boolean;
};

type InvitationDetailsResult = {
  valid: boolean;
  invitation?: InvitationDetails;
  error?: string;
};

export async function getInvitationDetails(
  invitationId: string,
): Promise<InvitationDetailsResult> {
  const now = new Date();

  const result = await db
    .select({
      id: invitationTable.id,
      email: invitationTable.email,
      workspaceName: workspaceTable.name,
      inviterName: userTable.name,
      expiresAt: invitationTable.expiresAt,
      status: invitationTable.status,
    })
    .from(invitationTable)
    .innerJoin(
      workspaceTable,
      eq(invitationTable.workspaceId, workspaceTable.id),
    )
    .innerJoin(userTable, eq(invitationTable.inviterId, userTable.id))
    .where(eq(invitationTable.id, invitationId))
    .limit(1);

  const row = result[0];
  if (!row) {
    return {
      valid: false,
      error: "Invitation not found",
    };
  }

  const expired = row.expiresAt < now;
  const isAccepted = row.status === "accepted";
  const isCanceled = row.status === "canceled";

  const baseInvitation: InvitationDetails = {
    id: row.id,
    email: row.email,
    workspaceName: row.workspaceName,
    inviterName: row.inviterName,
    expiresAt: row.expiresAt,
    status: row.status,
    expired,
  };

  if (isAccepted) {
    return {
      valid: false,
      error: "This invitation has already been accepted",
    };
  }

  if (isCanceled) {
    return {
      valid: false,
      error: "This invitation has been canceled",
    };
  }

  if (expired) {
    return {
      valid: false,
      invitation: baseInvitation,
      error: "This invitation has expired",
    };
  }

  return {
    valid: true,
    invitation: baseInvitation,
  };
}

export async function getUserPendingInvitations(userEmail: string) {
  const now = new Date();

  const result = await db
    .select({
      id: invitationTable.id,
      email: invitationTable.email,
      workspaceId: invitationTable.workspaceId,
      workspaceName: workspaceTable.name,
      inviterName: userTable.name,
      expiresAt: invitationTable.expiresAt,
      createdAt: invitationTable.createdAt,
      status: invitationTable.status,
    })
    .from(invitationTable)
    .innerJoin(
      workspaceTable,
      eq(invitationTable.workspaceId, workspaceTable.id),
    )
    .innerJoin(userTable, eq(invitationTable.inviterId, userTable.id))
    .where(
      and(
        eq(invitationTable.email, userEmail.toLowerCase()),
        eq(invitationTable.status, "pending"),
        gt(invitationTable.expiresAt, now),
      ),
    )
    .orderBy(invitationTable.createdAt);

  return result;
}
