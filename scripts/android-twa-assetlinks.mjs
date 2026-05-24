import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(repoRoot, "apps/android-twa/twa-manifest.json");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const packageName = (
  process.env["ANDROID_TWA_PACKAGE_ID"] ??
  process.env["NEXT_PUBLIC_ANDROID_TWA_PACKAGE_ID"] ??
  manifest.packageId ??
  "com.hanachat.app"
).trim();
const fingerprints = parseFingerprintList(
  process.env["ANDROID_TWA_SHA256_CERT_FINGERPRINTS"] ??
    process.env["NEXT_PUBLIC_ANDROID_TWA_SHA256_CERT_FINGERPRINTS"] ??
    "",
);

if (!packageName) {
  throw new Error("ANDROID_TWA_PACKAGE_ID is empty.");
}

if (fingerprints.length === 0) {
  throw new Error(
    "Set ANDROID_TWA_SHA256_CERT_FINGERPRINTS to the SHA-256 certificate fingerprint(s).",
  );
}

const assetLinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  },
];

const output = `${JSON.stringify(assetLinks, null, 2)}\n`;
const outputPath = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);

if (outputPath) {
  writeFileSync(resolve(process.cwd(), outputPath), output);
} else {
  process.stdout.write(output);
}

function parseFingerprintList(value) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}
