/**
 * Extracts the manual-entry fields from a TOTP enrollment URI
 * (`otpauth://totp/<label>?secret=...&issuer=...`), as returned by
 * `authClient.twoFactor.enable({ method: "totp" })`.
 *
 * `/setup-2fa` also renders a scannable QR code (via `react-qr-code`, using
 * the raw `totpURI` directly as its value) alongside the fields this
 * function extracts, as a manual-entry fallback for users who can't scan.
 */
export type ParsedOtpUri = {
  secret: string;
  issuer?: string;
  accountName?: string;
};

export function parseOtpAuthUri(uri: string): ParsedOtpUri {
  const parsed = new URL(uri);
  if (parsed.protocol !== "otpauth:") {
    throw new Error("Not an otpauth:// URI");
  }

  const secret = parsed.searchParams.get("secret");
  if (!secret) {
    throw new Error("otpauth:// URI is missing a secret parameter");
  }

  const issuerParam = parsed.searchParams.get("issuer") ?? undefined;

  // The label is `<issuer>:<account>` or just `<account>`, URI-encoded, in
  // the URI's path (e.g. "Pastry%20Management:owner%40example.com").
  const label = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const separatorIndex = label.indexOf(":");
  const labelIssuer = separatorIndex === -1 ? undefined : label.slice(0, separatorIndex);
  const labelAccount = separatorIndex === -1 ? label : label.slice(separatorIndex + 1);

  return {
    secret,
    issuer: issuerParam ?? labelIssuer,
    accountName: labelAccount || undefined,
  };
}
