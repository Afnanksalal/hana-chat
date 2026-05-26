import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const projectDir = resolve(repoRoot, "apps/android-twa");
const manifestPath = resolve(projectDir, "twa-manifest.json");
const gradlePath = resolve(projectDir, "app/build.gradle");
const productionTwaOrigin = "https://app.hanachat.site";
const rootPackage = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const origin = normalizeOrigin(
  process.env["ANDROID_TWA_ORIGIN"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["PUBLIC_WEB_URL"] ??
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    productionTwaOrigin,
);
const originUrl = new URL(origin);
assertProductionTwaOrigin(originUrl, "ANDROID_TWA_ORIGIN");
const versionName = process.env["ANDROID_TWA_VERSION_NAME"] ?? rootPackage.version ?? "0.1.0";
const versionCode = Number.parseInt(process.env["ANDROID_TWA_VERSION_CODE"] ?? "1", 10);
const packageId = process.env["ANDROID_TWA_PACKAGE_ID"] ?? manifest.packageId ?? "com.hanachat.app";
const startUrl = process.env["ANDROID_TWA_START_URL"] ?? "/app";
const imageBase = process.env["ANDROID_TWA_ASSET_ORIGIN"]
  ? normalizeOrigin(process.env["ANDROID_TWA_ASSET_ORIGIN"])
  : origin;
assertProductionTwaOrigin(new URL(imageBase), "ANDROID_TWA_ASSET_ORIGIN");

Object.assign(manifest, {
  packageId,
  host: originUrl.host,
  name: "Hana Chat",
  launcherName: "Hana",
  display: "standalone",
  themeColor: "#000000",
  themeColorDark: "#000000",
  navigationColor: "#000000",
  navigationColorDark: "#000000",
  navigationDividerColor: "#000000",
  navigationDividerColorDark: "#000000",
  backgroundColor: "#000000",
  startUrl,
  iconUrl: new URL("/assets/hana-icon-512.png", `${imageBase}/`).toString(),
  maskableIconUrl: new URL("/assets/hana-icon-512.png", `${imageBase}/`).toString(),
  webManifestUrl: new URL("/manifest.webmanifest", `${origin}/`).toString(),
  fullScopeUrl: new URL("/", `${origin}/`).toString(),
  appVersionName: versionName,
  appVersion: versionName,
  appVersionCode: Number.isFinite(versionCode) && versionCode > 0 ? versionCode : 1,
  signingKey: {
    path:
      process.env["ANDROID_TWA_KEYSTORE_PATH"] ??
      manifest.signingKey?.path ??
      "/app/android.keystore",
    alias: process.env["ANDROID_TWA_KEY_ALIAS"] ?? manifest.signingKey?.alias ?? "hana",
  },
});

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const dockerImage =
  process.env["BUBBLEWRAP_DOCKER_IMAGE"] ?? "ghcr.io/googlechromelabs/bubblewrap:latest";
const androidSdkLicenseInput =
  process.env["ANDROID_TWA_ACCEPT_ANDROID_SDK_LICENSES"] === "1" ? "y\n".repeat(128) : undefined;
const dockerEnv = [
  "BUBBLEWRAP_KEYSTORE_PASSWORD",
  "BUBBLEWRAP_KEY_PASSWORD",
  "NODE_TLS_REJECT_UNAUTHORIZED",
].flatMap((name) => (process.env[name] ? ["-e", name] : []));
const mount = `${projectDir}:/app`;

if (process.env["ANDROID_TWA_SKIP_UPDATE"] !== "1") {
  run("docker", [
    "run",
    "--rm",
    "-i",
    "-v",
    mount,
    "-w",
    "/app",
    ...dockerEnv,
    dockerImage,
    "update",
    "--skipVersionUpgrade",
  ]);
}

disableGeneratedReleaseMinification();

run(
  "docker",
  [
    "run",
    "--rm",
    "-i",
    "-v",
    mount,
    "-w",
    "/app",
    ...dockerEnv,
    dockerImage,
    "build",
    "--skipPwaValidation",
  ],
  androidSdkLicenseInput ? { input: androidSdkLicenseInput } : undefined,
);

function normalizeOrigin(value) {
  const originValue = value.trim().replace(/\/$/, "");

  if (!originValue) {
    throw new Error("Android TWA origin is empty.");
  }

  const url = new URL(originValue);

  if (url.protocol !== "https:") {
    throw new Error(`Android TWA origin must be HTTPS, got ${originValue}`);
  }

  return url.origin;
}

function assertProductionTwaOrigin(url, source) {
  if (url.origin !== productionTwaOrigin) {
    throw new Error(
      `Android TWA ${source} must be ${productionTwaOrigin}. Got ${url.origin}. Domain-only TWA releases are required.`,
    );
  }
}

function disableGeneratedReleaseMinification() {
  if (!existsSync(gradlePath)) {
    return;
  }

  const gradleConfig = readFileSync(gradlePath, "utf8");
  const updatedGradleConfig = gradleConfig.replace("minifyEnabled true", "minifyEnabled false");

  if (updatedGradleConfig !== gradleConfig) {
    writeFileSync(gradlePath, updatedGradleConfig);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    shell: false,
    input: options.input,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
