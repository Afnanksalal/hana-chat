import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieName, clearSessionCookie } from "../session-cookie";

const apiBaseUrl = process.env["API_GATEWAY_URL"] ?? "http://localhost:4000";

export async function POST(request: Request) {
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

  response.cookies.set(clearSessionCookie(request));

  return response;
}
