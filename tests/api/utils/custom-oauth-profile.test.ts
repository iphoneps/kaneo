import { describe, expect, it } from "vitest";
import {
  getCustomOAuthAccountSubject,
  mapCustomOAuthProfileToUser,
} from "../../../apps/api/src/utils/custom-oauth-profile";

describe("mapCustomOAuthProfileToUser", () => {
  it("uses the provider name when present", () => {
    expect(
      mapCustomOAuthProfileToUser({
        name: "Jane Doe",
        preferred_username: "jdoe",
        email: "jane@example.com",
      }),
    ).toEqual({ name: "Jane Doe" });
  });

  it("falls back to given and family name parts", () => {
    expect(
      mapCustomOAuthProfileToUser({
        given_name: "Jane",
        family_name: "Doe",
        preferred_username: "jdoe",
        email: "jane@example.com",
      }),
    ).toEqual({ name: "Jane Doe" });
  });

  it("falls back to preferred_username when name is missing", () => {
    expect(
      mapCustomOAuthProfileToUser({
        sub: "keycloak-user-id",
        email_verified: true,
        preferred_username: "jdoe",
        email: "jane@example.com",
      }),
    ).toEqual({ name: "jdoe" });
  });

  it("falls back to the email local part when no profile name is available", () => {
    expect(
      mapCustomOAuthProfileToUser({
        email: "jane@example.com",
      }),
    ).toEqual({ name: "jane" });
  });

  it("returns an empty mapping when no usable display value exists", () => {
    expect(mapCustomOAuthProfileToUser({ email: "" })).toEqual({});
  });
});

describe("getCustomOAuthAccountSubject", () => {
  it("prefers the provider id", () => {
    expect(
      getCustomOAuthAccountSubject({ id: "user-1", sub: "subject-1" }),
    ).toBe("user-1");
  });

  it("falls back to sub when the userinfo response has no id", () => {
    expect(getCustomOAuthAccountSubject({ sub: "keycloak-user-id" })).toBe(
      "keycloak-user-id",
    );
  });

  it("stringifies numeric ids", () => {
    expect(getCustomOAuthAccountSubject({ id: 42 })).toBe("42");
  });

  it("skips empty ids", () => {
    expect(getCustomOAuthAccountSubject({ id: "", sub: "subject-1" })).toBe(
      "subject-1",
    );
  });

  it("returns an empty string when the provider sends no identifier", () => {
    expect(getCustomOAuthAccountSubject({ id: null })).toBe("");
  });
});
