"use client";

import {
  Brain,
  Compass,
  Gem,
  House,
  MessageSquareText,
  Plus,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api";

const items = [
  { href: "/app", label: "Home", icon: House },
  { href: "/app/chat", label: "Chat", icon: MessageSquareText },
  { href: "/app/memory", label: "Memory", icon: Brain },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/create", label: "Create", icon: Plus },
  { href: "/app/nft", label: "Collectibles", icon: Gem },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

interface NavigationDashboardResponse {
  user: {
    roles?: string[];
  };
}

export function AppNavigation() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const navItems = useMemo(
    () =>
      isAdmin
        ? [
            ...items.slice(0, 5),
            { href: "/app/admin", label: "Admin", icon: ShieldCheck },
            ...items.slice(5),
          ]
        : items,
    [isAdmin],
  );

  useEffect(() => {
    let mounted = true;

    apiJson<NavigationDashboardResponse>("/api/v1/dashboard")
      .then((dashboard) => {
        if (mounted) {
          setIsAdmin(dashboard.user.roles?.includes("admin") ?? false);
        }
      })
      .catch(() => {
        if (mounted) {
          setIsAdmin(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <nav className={isAdmin ? "app-nav has-admin" : "app-nav"} aria-label="App navigation">
      {navItems.map((item) => {
        const isActive =
          item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);

        return (
          <Link
            className={isActive ? "app-nav-item active" : "app-nav-item"}
            href={item.href}
            key={item.href}
            aria-label={item.label}
            title={item.label}
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
