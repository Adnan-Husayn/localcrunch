import type { Metadata } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const description =
  "Drop in a CSV and see column types, distributions, missing values, duplicates and data-quality problems. It runs entirely in your browser, so nothing is uploaded.";

export const metadata: Metadata = {
  metadataBase: new URL("https://localcrunch.vercel.app"),
  title: "LocalCrunch: private data profiler",
  description,
  openGraph: {
    title: "LocalCrunch: private data profiler",
    description,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${schibsted.variable} ${plexMono.variable} antialiased overflow-x-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
