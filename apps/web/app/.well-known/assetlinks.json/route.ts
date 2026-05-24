import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface AndroidAssetLinkStatement {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

export function GET() {
  const packageName = (
    process.env["ANDROID_TWA_PACKAGE_ID"] ??
    process.env["NEXT_PUBLIC_ANDROID_TWA_PACKAGE_ID"] ??
    "com.hanachat.app"
  ).trim();
  const fingerprints = parseFingerprintList(
    process.env["ANDROID_TWA_SHA256_CERT_FINGERPRINTS"] ??
      process.env["NEXT_PUBLIC_ANDROID_TWA_SHA256_CERT_FINGERPRINTS"] ??
      "",
  );
  const statements: AndroidAssetLinkStatement[] =
    packageName && fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return NextResponse.json(statements, {
    headers: {
      "Cache-Control": fingerprints.length > 0 ? "public, max-age=3600" : "no-store",
    },
  });
}

function parseFingerprintList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}
