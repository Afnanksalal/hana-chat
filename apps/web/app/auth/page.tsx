"use client";

import { ArrowRight, BookHeart, Heart, KeyRound, Mail, UserRound, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { HanaLogo } from "../components/hana-logo";

type AuthMode = "signup" | "signin";
type AuthStep = "email" | "code";

interface StartResponse {
  verificationId?: string;
  riskAction?: string;
  verified?: boolean;
  userId?: string;
  devCode?: string;
  error?: { message?: string };
}

interface VerifyResponse {
  verified: boolean;
  userId?: string;
  error?: { message?: string };
}

const authDeviceStorageKey = "hana_auth_device_id";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [mode, setMode] = useState<AuthMode>("signup");
  const [step, setStep] = useState<AuthStep>("email");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function startVerification() {
    if (mode === "signup" && !username.trim()) {
      setStatus("Choose a username for your account.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setStatus("Enter the email address you want to use for Hana.");
      return;
    }

    setIsSubmitting(true);
    setStatus(undefined);

    try {
      const response = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          email: email.trim(),
          ...(mode === "signup" ? { username: username.trim() } : {}),
          deviceId: getOrCreateAuthDeviceId(),
        }),
      });
      const payload = (await response.json()) as StartResponse;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not send your email code.");
      }

      if (payload.verified) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      if (!payload.verificationId) {
        throw new Error("Could not send your email code.");
      }

      setVerificationId(payload.verificationId);
      setDevCode(payload.devCode);
      setStep("code");
      setStatus(
        payload.riskAction === "allow"
          ? "Code sent. Check your inbox."
          : "Code sent. Try again in a moment if it does not arrive.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode() {
    if (!/^\d{6,8}$/.test(code.trim())) {
      setStatus("Enter the 6 to 8 digit code from your email.");
      return;
    }

    setIsSubmitting(true);
    setStatus(undefined);

    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code,
          verificationId,
          deviceId: getOrCreateAuthDeviceId(),
        }),
      });
      const payload = (await response.json()) as VerifyResponse;

      if (!response.ok || !payload.verified) {
        throw new Error(payload.error?.message ?? "Invalid code.");
      }

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="brand-lockup auth-brand" href="/">
        <span className="brand-symbol" aria-hidden="true">
          <HanaLogo size={22} />
        </span>
        <span>Hana Chat</span>
      </Link>

      <section className="auth-shell">
        <div className="auth-copy">
          <h1>Your characters are waiting.</h1>
          <p>
            Sign in to continue your stories, saved memories, private characters, and premium
            worlds.
          </p>
          <div className="auth-trust-row">
            <span>
              <BookHeart size={17} /> Saved stories
            </span>
            <span>
              <Wand2 size={17} /> Custom characters
            </span>
            <span>
              <Heart size={17} /> Premium moments
            </span>
          </div>
        </div>

        <form
          className="auth-panel"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "email") {
              void startVerification();
            } else {
              void verifyCode();
            }
          }}
        >
          <div className="auth-mode-tabs" aria-label="Authentication mode">
            <button
              className={mode === "signup" ? "active" : ""}
              type="button"
              onClick={() => {
                setMode("signup");
                setStep("email");
                setStatus(undefined);
              }}
            >
              Create account
            </button>
            <button
              className={mode === "signin" ? "active" : ""}
              type="button"
              onClick={() => {
                setMode("signin");
                setStep("email");
                setStatus(undefined);
              }}
            >
              Sign in
            </button>
          </div>
          <div className="form-icon">
            {step === "code" ? <KeyRound size={22} /> : <Mail size={22} />}
          </div>
          <h2>
            {step === "code"
              ? "Enter your email code"
              : mode === "signup"
                ? "Create your account"
                : "Continue with email"}
          </h2>
          {mode === "signup" ? (
            <label>
              Username
              <span className="input-with-icon">
                <UserRound size={17} aria-hidden="true" />
                <input
                  autoComplete="username"
                  placeholder="Afnan"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={step === "code"}
                />
              </span>
            </label>
          ) : null}
          <label>
            Email
            <span className="input-with-icon">
              <Mail size={17} aria-hidden="true" />
              <input
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={step === "code"}
              />
            </span>
          </label>
          {step === "code" ? (
            <label>
              Code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder={devCode ? `Dev code ${devCode}` : "000000"}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
          ) : null}
          <p className="auth-consent-copy">
            Hana will email a one-time sign-in code from our official address.
          </p>
          {status ? <p className="form-status">{status}</p> : null}
          <button className="primary-action full-width" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Working..." : step === "email" ? "Send email code" : "Continue"}
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/app";
  }

  return value.startsWith("/auth") ? "/app" : value;
}

function getOrCreateAuthDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(authDeviceStorageKey);

    if (existing && existing.length >= 8) {
      return existing;
    }

    const next =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `hana-device-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    window.localStorage.setItem(authDeviceStorageKey, next);
    return next;
  } catch {
    return `hana-device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
