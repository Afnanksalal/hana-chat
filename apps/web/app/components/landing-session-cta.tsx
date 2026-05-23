"use client";

import { ArrowRight, Heart } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

interface LandingSessionCtaProps {
  authHref: string;
  dashboardHref: string;
  variant: "nav" | "hero" | "pricing";
  initialAuthenticated?: boolean;
  tone?: "primary" | "secondary";
  children?: ReactNode;
}

export function LandingSessionCta({
  authHref,
  dashboardHref,
  initialAuthenticated = false,
  tone = "primary",
  variant,
  children,
}: LandingSessionCtaProps) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [checked, setChecked] = useState(initialAuthenticated);

  useEffect(() => {
    let mounted = true;

    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          authenticated?: boolean;
          user?: unknown;
        };

        if (mounted) {
          setAuthenticated(
            response.ok && (payload.authenticated === true || Boolean(payload.user)),
          );
        }
      })
      .catch(() => {
        if (mounted) {
          setAuthenticated(false);
        }
      })
      .finally(() => {
        if (mounted) {
          setChecked(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const href = authenticated ? dashboardHref : authHref;
  const label = authenticated ? "Dashboard" : children;

  if (variant === "nav") {
    return (
      <Link className="nav-cta" href={href}>
        {checked && authenticated ? "Dashboard" : "Sign in"} <ArrowRight size={16} />
      </Link>
    );
  }

  if (variant === "pricing") {
    return (
      <Link
        className={
          tone === "secondary" ? "secondary-action full-width" : "primary-action full-width"
        }
        href={href}
      >
        {authenticated ? "Go to dashboard" : label}
      </Link>
    );
  }

  return (
    <Link className="primary-action" href={href}>
      {authenticated ? "Go to dashboard" : label}{" "}
      {authenticated ? <ArrowRight size={18} /> : <Heart size={18} />}
    </Link>
  );
}
