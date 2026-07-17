import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Colony Admin",
  description: "One Colony, Infinite Compute",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
