import type { Metadata } from "next";
import { headers } from "next/headers";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pastry Management System",
  description: "Multi-branch bakery back-office: products, inventory, production, orders and reports.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // E1: the per-request CSP nonce `src/proxy.ts` set on the request headers
  // (as `x-nonce`), threaded to MUI/Emotion via `AppRouterCacheProvider`.
  // Reading `headers()` also forces this layout into dynamic rendering,
  // which a fresh-per-request nonce requires (see the CSP guide in
  // `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
