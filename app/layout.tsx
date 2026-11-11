import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { NavigationProgress } from "@/components/navigation-progress";
import { NotificationPrompt } from "@/components/notification-prompt";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SplitMate — Dépenses partagées",
  description: "Gérez simplement les dépenses partagées en couple.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SplitMate",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`h-full ${geist.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js')})}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased font-sans bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
        <NavigationProgress />
        {children}
        <Analytics />
        <PwaInstallPrompt />
        <NotificationPrompt />
      </body>
    </html>
  );
}
