import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiBaseUrl = process.env["API_GATEWAY_URL"] ?? "http://localhost:4000";
const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(authCookieName)?.value;

  if (!sessionToken) {
    return NextResponse.json({ authenticated: false });
  }

  const response = await fetch(new URL("/v1/session", apiBaseUrl), {
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json(await response.json(), { status: response.status });
}
