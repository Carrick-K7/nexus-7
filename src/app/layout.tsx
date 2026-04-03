import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS | OMNIScient City Control Center",
  description: "Advanced cyberpunk city management and monitoring system",
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
