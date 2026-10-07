import type { NextConfig } from "next";

// E1 (security plan `.claude/plans/2026-09-29-security.md`): static
// response headers that don't need a per-request value. `Content-Security-
// Policy` is deliberately NOT here — it needs a fresh nonce per request,
// which this static config can't provide — see `src/proxy.ts` for that one.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
