import { cookies } from "next/headers";
import { getApiGatewayUrl } from "../server-api";

const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";

export async function getInitialAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(authCookieName)?.value;

  if (!sessionToken) {
    return false;
  }

  try {
    const response = await fetch(new URL("/v1/session", getApiGatewayUrl()), {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}
