import { describe, expect, it } from "vitest";
import {
  decryptPhoneNumber,
  encryptPhoneNumber,
  hashPhoneNumber,
  normalizePhoneNumber,
  shouldAllowLineType,
} from "./index";

describe("identity core", () => {
  it("normalizes phone numbers to E.164", () => {
    expect(normalizePhoneNumber("(415) 555-2671", "US")).toBe("+14155552671");
  });

  it("hashes phone numbers deterministically", () => {
    const phoneNumber = normalizePhoneNumber("+14155552671");
    const first = hashPhoneNumber(phoneNumber, "a-secure-test-secret");
    const second = hashPhoneNumber(phoneNumber, "a-secure-test-secret");

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("encrypts and decrypts phone numbers", () => {
    const phoneNumber = normalizePhoneNumber("+14155552671");
    const key = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptPhoneNumber(phoneNumber, key);

    expect(encrypted.value).not.toContain(phoneNumber);
    expect(decryptPhoneNumber(encrypted.value, key)).toBe(phoneNumber);
  });

  it("blocks high-abuse line types", () => {
    expect(shouldAllowLineType("mobile")).toBe("allow");
    expect(shouldAllowLineType("non_fixed_voip")).toBe("block");
    expect(shouldAllowLineType("unknown")).toBe("challenge");
  });
});
