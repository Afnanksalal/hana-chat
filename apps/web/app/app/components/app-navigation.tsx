"use client";

import { Compass, House, MessageSquareText, Plus, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Home", icon: House },
  { href: "/app/chat", label: "Chat", icon: MessageSquareText },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/create", label: "Create", icon: Plus },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="App navigation">
      {items.map((item) => {
        const isActive =
          item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);

        return (
          <Link
            className={isActive ? "app-nav-item active" : "app-nav-item"}
            href={item.href}
            key={item.href}
          >
            <item.icon size={19} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div className="app-user-pill">
        <UserRound size={18} />
        <span>Verified</span>
      </div>
    </nav>
  );
}
