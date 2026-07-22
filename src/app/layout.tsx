import type { Metadata } from "next";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "./globals.css";
import "../styles/tokens.css";
import "../styles/ring.css";
import "../styles/themes.css";
import "../styles/broadcast.css";

export const metadata: Metadata = {
  title: "420 IQ — Pilot Control System",
  description: "Studio control system for the 420 IQ knowledge game show.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
