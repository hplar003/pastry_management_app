import { describe, expect, it } from "vitest";
import { parseOtpAuthUri } from "./otp-uri";

describe("parseOtpAuthUri", () => {
  it("extracts the secret, issuer and account from a typical otpauth:// URI", () => {
    const uri =
      "otpauth://totp/Pastry%20Management:owner%40example.com?secret=ABCDEFGHIJKLMNOP&issuer=Pastry%20Management&algorithm=SHA1&digits=6&period=30";
    expect(parseOtpAuthUri(uri)).toEqual({
      secret: "ABCDEFGHIJKLMNOP",
      issuer: "Pastry Management",
      accountName: "owner@example.com",
    });
  });

  it("falls back to the label's issuer segment when the issuer query param is absent", () => {
    const uri = "otpauth://totp/My%20App:someone@example.com?secret=SECRET123";
    expect(parseOtpAuthUri(uri)).toEqual({
      secret: "SECRET123",
      issuer: "My App",
      accountName: "someone@example.com",
    });
  });

  it("treats the whole label as the account name when there is no issuer segment", () => {
    const uri = "otpauth://totp/someone%40example.com?secret=SECRET123";
    expect(parseOtpAuthUri(uri)).toEqual({
      secret: "SECRET123",
      issuer: undefined,
      accountName: "someone@example.com",
    });
  });

  it("throws when the URI has no secret parameter", () => {
    const uri = "otpauth://totp/someone@example.com?issuer=Foo";
    expect(() => parseOtpAuthUri(uri)).toThrow(/secret/i);
  });

  it("throws when given a non-otpauth URI", () => {
    expect(() => parseOtpAuthUri("https://example.com?secret=SECRET123")).toThrow(/otpauth/i);
  });
});
