import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS-7 | Synthetic Shenzhen Human Observatory",
  description:
    "A public, read-only observatory for the all-software Synthetic Shenzhen experiment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  );
}
