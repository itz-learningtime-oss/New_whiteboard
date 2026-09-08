import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Voice, My Story — A little story. All yours.",
  description: "Bring your illustrations, words, and voice together. Create an audio-synchronized, split-page storybook with hand-drawn illustrations, kinetic handwriting, and beautiful page turns.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
