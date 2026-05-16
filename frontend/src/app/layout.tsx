import type { Metadata } from "next";
import { IBM_Plex_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { PlayerPreferencesProvider } from "@/lib/player-preferences";
import { SoundProvider } from "@/lib/sound-provider";
import { ToastProvider } from "@/lib/toast-provider";

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Code Mole",
  description:
    "Retro social-deduction coding arena for lobby battles, sabotage rounds, and emergency code reviews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${pixelFont.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PlayerPreferencesProvider>
          <SoundProvider>
            <ToastProvider>{children}</ToastProvider>
          </SoundProvider>
        </PlayerPreferencesProvider>
      </body>
    </html>
  );
}
