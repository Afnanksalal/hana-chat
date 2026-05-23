import { NextResponse, type NextRequest } from "next/server";

const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";
const apiBaseUrl = process.env["API_GATEWAY_URL"] ?? "http://localhost:4000";

export async function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get(authCookieName)?.value;
  const hasSession = await hasValidSession(sessionToken);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/app") && !hasSession) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/auth" && hasSession) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/auth"],
};

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(new URL("/v1/session", apiBaseUrl), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}
