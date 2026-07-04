import { NextResponse, type NextRequest } from "next/server";
import { getApiGatewayUrl } from "./server-api";

const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";

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
    const response = await fetch(new URL("/v1/session", getApiGatewayUrl()), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}
