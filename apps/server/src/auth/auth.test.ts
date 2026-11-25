import { describe, expect, it } from "vitest";
import { auth, rejectUnverifiedEmail } from "./auth";

const withClaims = (profile: Record<string, unknown>) => ({ source: { oauth: { profile } } });

describe("rejectUnverifiedEmail", () => {
  it("refuses a profile whose email address the provider has not verified", () => {
    expect(
      rejectUnverifiedEmail(withClaims({ email: "a@example.org", email_verified: false })),
    ).toMatchObject({
      error: "email_not_verified",
    });
    expect(rejectUnverifiedEmail(withClaims({ email_verified: "false" }))).toMatchObject({
      error: "email_not_verified",
    });
  });

  it("accepts verified addresses and providers that send no claim", () => {
    expect(rejectUnverifiedEmail(withClaims({ email_verified: true }))).toBeUndefined();
    expect(rejectUnverifiedEmail(withClaims({ email: "a@example.org" }))).toBeUndefined();
    expect(rejectUnverifiedEmail({ source: {} })).toBeUndefined();
  });

  it("is the sign-in check", () => {
    expect(auth().options.user?.validateUserInfo).toBe(rejectUnverifiedEmail);
  });
});
