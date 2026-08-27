import { createHash, randomUUID } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import db from "../database";
import { mcpOauthClientTable, sessionTable } from "../database/schema";

type RegisteredClient = {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  issuedAt: number;
};

type AuthCode = {
  clientId: string;
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
};

export type AuthorizationRequest = {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  expiresAt: number;
};

/*
 * Registered clients are persisted. They used to live in an in-memory Map, so
 * every API restart invalidated every client that had ever registered and
 * connected MCP clients failed re-authentication with `invalid_client`.
 *
 * Auth codes and authorization requests stay in memory deliberately: both
 * expire within minutes and are consumed by the same process that issued
 * them. If the API is ever run with more than one replica they will need
 * persisting too, because the authorize and callback legs can land on
 * different instances.
 */
const codes = new Map<string, AuthCode>();
const authorizationRequests = new Map<string, AuthorizationRequest>();
const maxAuthorizationRequests = 10_000;

function pruneAuthorizationRequests(now = Date.now()): void {
  for (const [requestId, request] of authorizationRequests) {
    if (request.expiresAt < now) authorizationRequests.delete(requestId);
  }

  while (authorizationRequests.size >= maxAuthorizationRequests) {
    const oldestRequestId = authorizationRequests.keys().next().value;
    if (!oldestRequestId) break;
    authorizationRequests.delete(oldestRequestId);
  }
}

export async function getClient(
  clientId: string,
): Promise<RegisteredClient | undefined> {
  const [row] = await db
    .select()
    .from(mcpOauthClientTable)
    .where(eq(mcpOauthClientTable.clientId, clientId))
    .limit(1);

  if (!row) return undefined;

  return {
    clientId: row.clientId,
    redirectUris: row.redirectUris,
    clientName: row.clientName ?? undefined,
    issuedAt: Math.floor(row.issuedAt.getTime() / 1000),
  };
}

export async function registerClient(params: {
  redirectUris: string[];
  clientName?: string;
}): Promise<RegisteredClient> {
  const clientId = randomUUID();
  const issuedAt = new Date();

  await db.insert(mcpOauthClientTable).values({
    clientId,
    redirectUris: [...params.redirectUris],
    clientName: params.clientName ?? null,
    issuedAt,
  });

  return {
    clientId,
    redirectUris: [...params.redirectUris],
    clientName: params.clientName,
    issuedAt: Math.floor(issuedAt.getTime() / 1000),
  };
}

export function createAuthCode(params: {
  clientId: string;
  userId: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const code = randomUUID();
  codes.set(code, {
    ...params,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return code;
}

export function createAuthorizationRequest(params: {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
}): string {
  pruneAuthorizationRequests();
  const requestId = randomUUID();
  authorizationRequests.set(requestId, {
    ...params,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return requestId;
}

export function getAuthorizationRequest(
  requestId: string,
): AuthorizationRequest | undefined {
  const request = authorizationRequests.get(requestId);
  if (!request) return undefined;
  if (request.expiresAt < Date.now()) {
    authorizationRequests.delete(requestId);
    return undefined;
  }
  return request;
}

export function consumeAuthorizationRequest(
  requestId: string,
): AuthorizationRequest | undefined {
  const request = getAuthorizationRequest(requestId);
  if (!request) return undefined;
  authorizationRequests.delete(requestId);
  return request;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = createHash("sha256").update(codeVerifier).digest();
  return base64url(hash) === codeChallenge;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const stored = codes.get(code);
  if (!stored) return null;
  codes.delete(code);

  if (stored.clientId !== clientId) return null;
  if (stored.redirectUri !== redirectUri) return null;
  if (stored.expiresAt < Date.now()) return null;
  if (!verifyPkce(codeVerifier, stored.codeChallenge)) return null;

  const sessionToken = randomUUID();
  const expiresIn = 30 * 24 * 60 * 60;

  await db.insert(sessionTable).values({
    id: createId(),
    token: sessionToken,
    userId: stored.userId,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { accessToken: sessionToken, expiresIn };
}
