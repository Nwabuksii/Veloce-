import "./globals.css";
import ToastViewport from "./components/ToastViewport";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

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
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"
        />
      </head>
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}