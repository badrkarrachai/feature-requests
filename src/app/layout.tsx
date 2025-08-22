import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feature Requests",
  description:
    "Feature requests board where users can easily share their ideas, vote on suggestions they love, and help shape the product together. Built to make feedback simple and transparent, turning great ideas into real features through community collaboration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
