import { cookies } from "next/headers";

const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";
const apiBaseUrl = process.env["API_GATEWAY_URL"] ?? "http://localhost:4000";

export async function getInitialAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(authCookieName)?.value;

  if (!sessionToken) {
    return false;
  }

  try {
    const response = await fetch(new URL("/v1/session", apiBaseUrl), {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}
