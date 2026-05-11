import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learn Codex App",
  description: "A Next.js app scaffolded with Codex"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
