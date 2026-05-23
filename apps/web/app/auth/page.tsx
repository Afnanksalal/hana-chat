"use client";

import { ArrowRight, BookHeart, Heart, Phone, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { HanaLogo } from "../components/hana-logo";

type AuthStep = "phone" | "code";

interface StartResponse {
  verificationId?: string;
  riskAction?: string;
  verified?: boolean;
  userId?: string;
  devCode?: string;
}

interface VerifyResponse {
  verified: boolean;
  userId?: string;
}

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [step, setStep] = useState<AuthStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function startVerification() {
    setIsSubmitting(true);
    setStatus(undefined);

    try {
      const response = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      const payload = (await response.json()) as StartResponse;

      if (!response.ok) {
        throw new Error("Could not start phone verification.");
      }

      if (payload.verified) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      if (!payload.verificationId) {
        throw new Error("Could not start phone verification.");
      }

      setVerificationId(payload.verificationId);
      setDevCode(payload.devCode);
      setStep("code");
      setStatus(
        payload.riskAction === "allow"
          ? "Code sent."
          : "Code sent. Try again in a moment if it does not arrive.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode() {
    setIsSubmitting(true);
    setStatus(undefined);

    try {
      const response = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code, verificationId }),
      });
      const payload = (await response.json()) as VerifyResponse;

      if (!response.ok || !payload.verified) {
        throw new Error("Invalid code.");
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
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "phone") {
              void startVerification();
            } else {
              void verifyCode();
            }
          }}
        >
          <div className="form-icon">
            <Phone size={22} />
          </div>
          <h2>{step === "phone" ? "Continue with phone" : "Enter your code"}</h2>
          <label>
            Phone number
            <input
              autoComplete="tel"
              inputMode="tel"
              placeholder="+1 555 123 4567"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              disabled={step === "code"}
              required
            />
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
                required
              />
            </label>
          ) : null}
          {status ? <p className="form-status">{status}</p> : null}
          <button className="primary-action full-width" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Working..." : step === "phone" ? "Send code" : "Continue"}
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

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
