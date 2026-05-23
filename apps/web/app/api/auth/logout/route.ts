import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const apiBaseUrl = process.env["API_GATEWAY_URL"] ?? "http://localhost:4000";
const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";
const authCookieDomain = process.env["AUTH_COOKIE_DOMAIN"];

export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(authCookieName)?.value;

  if (sessionToken) {
    await fetch(new URL("/v1/auth/logout", apiBaseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: authCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    domain: authCookieDomain || undefined,
    maxAge: 0,
    path: "/",
  });

  return response;
}
