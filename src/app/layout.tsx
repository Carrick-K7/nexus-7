import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS-7 · 研究概览",
  description:
    "研究状态、实验结果与历史记录。Research status, experiment results and records.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  );
}
