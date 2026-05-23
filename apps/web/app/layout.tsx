import type { Metadata, Viewport } from "next";
import { absoluteUrl, getSiteUrl, siteDescription, siteKeywords, siteName } from "./seo";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: "Hana Chat | AI characters who remember you",
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: siteKeywords,
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  category: "entertainment",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/assets/hana-icon-192.png",
    icon: "/assets/hana-favicon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteName,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName,
    title: "Hana Chat | AI characters who remember you",
    description: siteDescription,
    images: [
      {
        url: absoluteUrl("/assets/hana-hero.png"),
        width: 1200,
        height: 630,
        alt: "Hana Chat anime-inspired AI companion",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hana Chat | AI characters who remember you",
    description: siteDescription,
    images: [absoluteUrl("/assets/hana-hero.png")],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  other: {
    "mobile-web-app-capable": "yes",
    "format-detection": "telephone=no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
