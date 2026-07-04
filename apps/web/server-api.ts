const localApiGatewayUrl = "http://localhost:4000";

export function getApiGatewayUrl(): string {
  const configuredUrl = process.env["API_GATEWAY_URL"]?.trim();
  const apiGatewayUrl = configuredUrl || localApiGatewayUrl;

  if (!configuredUrl && process.env["NODE_ENV"] === "production") {
    throw new Error("API_GATEWAY_URL is required in production");
  }

  try {
    new URL(apiGatewayUrl);
  } catch {
    throw new Error("API_GATEWAY_URL must be an absolute URL");
  }

  return apiGatewayUrl;
}
