import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS-7｜看懂它在做什么",
  description:
    "用真实例子看懂这个自动实验程序做过什么、改了什么想法、为什么停止。Plain-language records of small computer experiments, their mistakes and their limits.",
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
