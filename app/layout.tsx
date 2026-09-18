import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Girl Dinner — decide what to eat",
  description:
    "Find a restaurant everyone is into, or make tonight a Girl Dinner.",
};

export const viewport: Viewport = {
  themeColor: "#f2edff",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
