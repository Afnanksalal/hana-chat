import type { NextConfig } from "next";

const isProduction = process.env["NODE_ENV"] === "production";
const configuredSiteUrl = process.env["NEXT_PUBLIC_SITE_URL"] ?? process.env["WEB_ORIGIN"] ?? "";
const shouldUpgradeInsecureRequests =
  isProduction && configuredSiteUrl.trim().startsWith("https://");
const scriptSrc = ["'self'", "'unsafe-inline'", isProduction ? "" : "'unsafe-eval'"]
  .filter(Boolean)
  .join(" ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          `script-src ${scriptSrc}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-src 'none'",
          "form-action 'self'",
          shouldUpgradeInsecureRequests ? "upgrade-insecure-requests" : "",
        ]
          .filter(Boolean)
          .join("; "),
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), payment=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];

    return Promise.resolve([
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]);
  },
};

export default nextConfig;
