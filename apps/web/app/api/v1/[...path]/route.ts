import { cookies } from "next/headers";
import { getApiGatewayUrl } from "../../../../server-api";

const authCookieName = process.env["AUTH_COOKIE_NAME"] ?? "hana_session";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST");
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, context, "PATCH");
}

export async function DELETE(request: Request, context: RouteContext) {
  return forward(request, context, "DELETE");
}

async function forward(request: Request, context: RouteContext, method: string): Promise<Response> {
  const { path } = await context.params;
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/v1/${path.map(encodeURIComponent).join("/")}`, getApiGatewayUrl());

  targetUrl.search = sourceUrl.search;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(authCookieName)?.value;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const fetchInit: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };

  if (method !== "GET") {
    fetchInit.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl, fetchInit);
  const responseHeaders = new Headers();
  const passthroughHeaders = ["content-type", "cache-control", "x-accel-buffering"];

  for (const header of passthroughHeaders) {
    const value = response.headers.get(header);

    if (value) {
      responseHeaders.set(header, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
