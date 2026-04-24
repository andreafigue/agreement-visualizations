import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agreement Visualizations",
  description: "Static agreement timeline and coder network visualizations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
