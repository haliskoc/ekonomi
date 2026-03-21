import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Company Research Studio",
    template: "%s | Company Research Studio",
  },
  description: "BIST ve global piyasalar icin haber, teknik grafik, finansal tablo ve senaryo analizi platformu.",
  keywords: ["BIST", "stock analysis", "technical chart", "financial statements", "market summary"],
  openGraph: {
    title: "Company Research Studio",
    description: "BIST ve global piyasalar icin analiz platformu.",
    type: "website",
    locale: "tr_TR",
    siteName: "Company Research Studio",
  },
  twitter: {
    card: "summary_large_image",
    title: "Company Research Studio",
    description: "BIST ve global piyasalar icin analiz platformu.",
  },
  metadataBase: new URL("https://example.com"),
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
