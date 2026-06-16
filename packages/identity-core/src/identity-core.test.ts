import { describe, expect, it } from "vitest";
import {
  decryptEmailAddress,
  emailDomain,
  encryptEmailAddress,
  hashEmailAddress,
  normalizeEmailAddress,
} from "./index";

describe("identity core", () => {
  it("normalizes and hashes email addresses deterministically", () => {
    const email = normalizeEmailAddress("  USER@Example.COM ");
    const first = hashEmailAddress(email, "a-secure-test-secret");
    const second = hashEmailAddress(email, "a-secure-test-secret");

    expect(email).toBe("user@example.com");
    expect(emailDomain(email)).toBe("example.com");
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("encrypts and decrypts email addresses", () => {
    const email = normalizeEmailAddress("user@example.com");
    const key = Buffer.alloc(32, 8).toString("base64");
    const encrypted = encryptEmailAddress(email, key);

    expect(encrypted.value).not.toContain(email);
    expect(decryptEmailAddress(encrypted.value, key)).toBe(email);
  });
});
