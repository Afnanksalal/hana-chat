import type { Metadata } from "next";
import Link from "next/link";
import { HanaLogo } from "../components/hana-logo";
import { AppNavigation } from "./components/app-navigation";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="product-shell">
      <aside className="app-sidebar">
        <Link className="brand-lockup app-brand" href="/app">
          <span className="brand-symbol" aria-hidden="true">
            <HanaLogo size={22} />
          </span>
          <span>Hana Chat</span>
        </Link>
        <AppNavigation />
      </aside>

      <section className="product-main">{children}</section>
    </main>
  );
}
