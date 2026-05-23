import { NextResponse } from "next/server";
import { createSessionCookie } from "../../session-cookie";

const apiBaseUrl = process.env["API_GATEWAY_URL"] ?? "http://localhost:4000";

interface StartPayload {
  verified?: boolean;
  sessionToken?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const headers = forwardAuthHeaders(request);
    const response = await fetch(new URL("/v1/auth/phone/start", apiBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as StartPayload;
    const nextResponse = NextResponse.json(stripSessionToken(payload), {
      status: response.status,
    });

    if (response.ok && payload.verified === true && typeof payload.sessionToken === "string") {
      nextResponse.cookies.set(createSessionCookie(request, payload.sessionToken));
    }

    return nextResponse;
  } catch (error) {
    if (process.env["NODE_ENV"] !== "production") {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "auth service unavailable" },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: "auth service unavailable" }, { status: 502 });
  }
}

function forwardAuthHeaders(request: Request): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const userAgent = request.headers.get("user-agent");
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (userAgent) {
    headers.set("User-Agent", userAgent);
  }

  if (forwardedFor) {
    headers.set("X-Forwarded-For", forwardedFor);
  }

  if (realIp) {
    headers.set("X-Real-IP", realIp);
  }

  return headers;
}

function stripSessionToken<T extends { sessionToken?: string }>(
  payload: T,
): Omit<T, "sessionToken"> {
  const safePayload = { ...payload };
  delete safePayload.sessionToken;

  return safePayload;
}
