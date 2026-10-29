export type DeviceRequest = {
  clientId: string;
  scopes: string[];
  status: string;
};

export type DeviceRequestState =
  | { state: "loading" }
  | { state: "ready"; request: DeviceRequest }
  | { state: "other-account" }
  | { state: "failed"; message?: string };

type DeviceVerifyResponse = {
  data?: { client_id?: unknown; scope?: unknown; status?: unknown } | null;
  error?: { error_description?: string } | null;
};

const knownClientKeys: Record<string, string> = {
  "kaneo-cli": "auth:device.clients.kaneoCli",
  "kaneo-mcp": "auth:device.clients.kaneoMcp",
};

/** i18n key for a first-party client, or undefined for any other client id. */
export function deviceClientNameKey(clientId: string) {
  return knownClientKeys[clientId];
}

export function parseDeviceScopes(scope: unknown) {
  if (typeof scope !== "string") return [];
  return scope.split(/\s+/).filter(Boolean);
}

// GET /device returns the client and scopes only to the user who claimed the
// code, so a missing client id means another account holds this request.
export function toDeviceRequestState(
  response: DeviceVerifyResponse,
): DeviceRequestState {
  if (response.error) {
    return { state: "failed", message: response.error.error_description };
  }
  const clientId = response.data?.client_id;
  if (typeof clientId !== "string" || !clientId) {
    return { state: "other-account" };
  }
  return {
    state: "ready",
    request: {
      clientId,
      scopes: parseDeviceScopes(response.data?.scope),
      status:
        typeof response.data?.status === "string" ? response.data.status : "",
    },
  };
}
