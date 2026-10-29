function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function mapCustomOAuthProfileToUser(profile: Record<string, unknown>) {
  const email = stringOrEmpty(profile.email);
  const nameFromParts = [
    stringOrEmpty(profile.given_name),
    stringOrEmpty(profile.family_name),
  ]
    .filter(Boolean)
    .join(" ");

  const fallbackName = [
    stringOrEmpty(profile.name),
    nameFromParts,
    stringOrEmpty(profile.preferred_username),
    email ? email.split("@")[0] : "",
  ].find(Boolean);

  return fallbackName ? { name: fallbackName } : {};
}

function nonEmptyId(value: unknown) {
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Provider-side account id for the custom OAuth/OIDC provider.
 *
 * better-auth 1.7 reads only `sub` for discovery (OIDC) providers and only `id`
 * for providers configured with explicit endpoints. 1.6 used `id` and fell back
 * to `sub`. Keep that order so a provider configured with explicit endpoints
 * whose userinfo returns only `sub` (Keycloak, Pocket ID, Authentik) can still
 * sign in, and accounts linked on 1.6 keep the same id.
 */
export function getCustomOAuthAccountSubject(profile: {
  id?: unknown;
  sub?: unknown;
}) {
  return nonEmptyId(profile.id) ?? nonEmptyId(profile.sub) ?? "";
}
