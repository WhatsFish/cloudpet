import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC;
const UMAMI_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export const metadata: Metadata = {
  title: "云宠物 — ai-native",
  description:
    "测一测，领养一只为你而来的本命小宠。像素风、有性格、会成长，陪你过好每一天。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 antialiased font-sans">
        {UMAMI_SRC && UMAMI_ID ? (
          <Script defer src={UMAMI_SRC} data-website-id={UMAMI_ID} strategy="afterInteractive" />
        ) : null}
        {children}
      </body>
    </html>
  );
}
