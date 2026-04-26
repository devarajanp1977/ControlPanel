// app/layout.tsx — root layout establishes the global theme, fonts, and metadata for every route.
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "next-themes";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Aegis",
  description: "Single-server VPS control panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} aegis-shell antialiased`}>
        <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}