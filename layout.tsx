import "./globals.css";
// Self-hosted instead of the cdnjs <link> that was here before — icons
// (all of them are "fas", so only the solid set + base styles are
// needed, not the full "all.css") now ship as part of our own JS bundle
// and get served from our own domain. If cdnjs.cloudflare.com is down,
// blocked by the visitor's browser/network, or an ad-blocker strips
// third-party stylesheet links, icons still render — nothing depends on
// reaching an external host anymore.
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import { Archivo, JetBrains_Mono } from "next/font/google";
import ToastViewport from "./app/components/ToastViewport";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Veloce",
  description: "Academic notes marketplace — Babcock pilot",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}