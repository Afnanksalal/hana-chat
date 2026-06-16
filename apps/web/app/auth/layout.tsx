import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Hana Chat with your email to continue your characters and stories.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
