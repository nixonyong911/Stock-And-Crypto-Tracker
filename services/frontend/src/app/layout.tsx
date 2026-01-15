import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock And Crypto Tracker - AI-Powered Market Clarity",
  description:
    "AI-powered market analysis for stocks and crypto. Get clear signals without the noise, delivered directly to Telegram.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
