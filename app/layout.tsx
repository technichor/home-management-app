import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Outfit } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App } from "antd";
import ThemeProvider from "@/components/ThemeProvider";
import { BRAND_NAME, TAGLINE } from "@/lib/brand";
import { PALETTE, SCHEME_COOKIE, SCHEME_SCRIPT, paletteCss, type Scheme } from "@/lib/palette";
import { appUrl } from "@/lib/email";
import "./globals.css";

// The brand's display face (headings), self-hosted by next/font at build time.
const outfit = Outfit({ subsets: ["latin"], weight: "600", variable: "--font-display", display: "swap" });

// The icons, manifest and link-preview image come from the brand kit (docs/brand/identity.md), served from public/.
export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: BRAND_NAME,
  description: TAGLINE,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: BRAND_NAME,
    description: TAGLINE,
    siteName: BRAND_NAME,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PALETTE.light.bg },
    { media: "(prefers-color-scheme: dark)", color: PALETTE.dark.bg },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const saved = (await cookies()).get(SCHEME_COOKIE)?.value;
  const initial: Scheme = saved === "dark" ? "dark" : "light";

  return (
    <html lang="en" data-theme={initial} className={outfit.variable} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: paletteCss() }} />
        <script dangerouslySetInnerHTML={{ __html: SCHEME_SCRIPT }} />
      </head>
      <body>
        <AntdRegistry>
          <ThemeProvider initial={initial}>
            <App>{children}</App>
          </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
