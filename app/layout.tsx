import "./globals.css";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import ToastViewport from "./components/ToastViewport";
import SiteChrome from "./components/SiteChrome";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { headers } from "next/headers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the generated nonce from request headers
  const nonce = (await headers()).get("x-nonce") || undefined;

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Pass the nonce here so the browser allows this inline script */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <SiteChrome>{children}</SiteChrome>
        <ToastViewport />
      </body>
    </html>
  );
}
