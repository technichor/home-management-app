import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App } from "antd";
import ThemeProvider from "@/components/ThemeProvider";
import { BRAND_NAME, TAGLINE } from "@/lib/brand";
import { SCHEME_COOKIE, SCHEME_SCRIPT, paletteCss, type Scheme } from "@/lib/palette";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: TAGLINE,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const saved = (await cookies()).get(SCHEME_COOKIE)?.value;
  const initial: Scheme = saved === "dark" ? "dark" : "light";

  return (
    <html lang="en" data-theme={initial} suppressHydrationWarning>
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
