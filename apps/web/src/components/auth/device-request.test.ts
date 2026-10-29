import { expect, it } from "vite-plus/test";
import {
  deviceClientNameKey,
  parseDeviceScopes,
  toDeviceRequestState,
} from "./device-request";

it.each([
  ["openid profile  email", ["openid", "profile", "email"]],
  ["", []],
  [undefined, []],
])("parses scopes from %j", (input, expected) => {
  expect(parseDeviceScopes(input)).toEqual(expected);
});

it("names first-party clients and leaves others to show their id", () => {
  expect(deviceClientNameKey("kaneo-mcp")).toBe("auth:device.clients.kaneoMcp");
  expect(deviceClientNameKey("some-other-app")).toBeUndefined();
});

it("reads the client, scopes and status of a claimed request", () => {
  expect(
    toDeviceRequestState({
      data: { client_id: "kaneo-mcp", scope: "openid", status: "pending" },
      error: null,
    }),
  ).toEqual({
    state: "ready",
    request: { clientId: "kaneo-mcp", scopes: ["openid"], status: "pending" },
  });
});

it("treats a request without a client as held by another account", () => {
  expect(
    toDeviceRequestState({ data: { status: "pending" }, error: null }),
  ).toEqual({ state: "other-account" });
});

it("passes the server's error through", () => {
  expect(
    toDeviceRequestState({
      data: null,
      error: { error_description: "Invalid user code" },
    }),
  ).toEqual({ state: "failed", message: "Invalid user code" });
});
