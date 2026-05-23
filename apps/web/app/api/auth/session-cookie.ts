export const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";

export function createSessionCookie(request: Request, value: string) {
  return {
    name: authCookieName,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsRequest(request),
    domain: getCookieDomain(request),
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}

export function clearSessionCookie(request: Request) {
  return {
    name: authCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsRequest(request),
    domain: getCookieDomain(request),
    maxAge: 0,
    path: "/",
  };
}

function isHttpsRequest(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (forwardedProto) {
    return forwardedProto.toLowerCase() === "https";
  }

  return new URL(request.url).protocol === "https:";
}

function getCookieDomain(request: Request): string | undefined {
  const configuredDomain = process.env["AUTH_COOKIE_DOMAIN"]?.trim();

  if (!configuredDomain) {
    return undefined;
  }

  const hostname = getRequestHostname(request).toLowerCase();
  const normalizedDomain = configuredDomain.replace(/^\./, "").toLowerCase();

  if (hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`)) {
    return configuredDomain;
  }

  return undefined;
}

function getRequestHostname(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;

  if (host.startsWith("[") && host.includes("]")) {
    return host.slice(1, host.indexOf("]"));
  }

  return host.split(":")[0] ?? host;
}
