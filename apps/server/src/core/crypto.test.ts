import { describe, expect, it } from "vitest";
import { SecretDecryptionError, decryptSecret, encryptSecret } from "./crypto";

describe("stored credentials", () => {
  it("decrypt to what was saved", () => {
    expect(decryptSecret(encryptSecret("xoxb-123"))).toBe("xoxb-123");
  });

  it("fail with SecretDecryptionError when damaged or in an unknown format", () => {
    const [version, iv, tag, ciphertext] = encryptSecret("xoxb-123").split(":");
    const damaged = [version, iv, tag, Buffer.from("xoxb-999").toString("base64")].join(":");
    expect(ciphertext).toBeTruthy();
    expect(() => decryptSecret(damaged)).toThrow(SecretDecryptionError);
    expect(() => decryptSecret("plain-text")).toThrow(SecretDecryptionError);
  });
});
