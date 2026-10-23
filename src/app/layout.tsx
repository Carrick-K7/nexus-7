import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS-7 | Counterexample-driven Research Station · 反例驱动研究站",
  description:
    "A human-readable, read-only research station: questions, counterexamples, bounded experiments, budgets, and historical city evidence. 只读研究、反例与历史城市证据。",
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
