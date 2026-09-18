import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Figtree, Young_Serif } from "next/font/google";
import "./globals.css";

const body = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const display = Young_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Girl Dinner — decide what to eat",
  description:
    "Find a restaurant everyone is into, or make tonight a Girl Dinner.",
};

export const viewport: Viewport = {
  themeColor: "#2b1f27",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
