import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const productionTwaOrigin = "https://app.hanachat.site";
const productionHost = new URL(productionTwaOrigin).host;
const productionPackageId = "com.hanachat.app";
const failures = [];

const manifest = readJson("apps/android-twa/twa-manifest.json");
const webManifest = readJson("apps/android-twa/app/src/main/res/raw/web_app_manifest.json");
const buildGradle = readText("apps/android-twa/app/build.gradle");
const stringsXml = readText("apps/android-twa/app/src/main/res/values/strings.xml");
const androidManifest = readText("apps/android-twa/app/src/main/AndroidManifest.xml");

checkOptionalOriginEnv("ANDROID_TWA_ORIGIN");
checkOptionalOriginEnv("ANDROID_TWA_ASSET_ORIGIN");

assertEqual(manifest.packageId, productionPackageId, "TWA package id");
assertEqual(manifest.host, productionHost, "TWA host");
assertEqual(manifest.name, "Hana Chat", "TWA app name");
assertEqual(manifest.launcherName, "Hana", "TWA launcher name");
assertEqual(manifest.display, "standalone", "TWA display mode");
assertEqual(manifest.startUrl, "/app", "TWA start URL");
assertEqual(manifest.fullScopeUrl, `${productionTwaOrigin}/`, "TWA full scope URL");
assertEqual(
  manifest.webManifestUrl,
  `${productionTwaOrigin}/manifest.webmanifest`,
  "TWA web manifest URL",
);
assertUrlOrigin(manifest.iconUrl, productionTwaOrigin, "TWA icon URL");
assertUrlOrigin(manifest.maskableIconUrl, productionTwaOrigin, "TWA maskable icon URL");
assertEqual(manifest.themeColor, "#000000", "TWA theme color");
assertEqual(manifest.backgroundColor, "#000000", "TWA background color");

assertEqual(webManifest.id, "/app", "PWA manifest id");
assertEqual(webManifest.start_url, "/app", "PWA manifest start_url");
assertEqual(webManifest.scope, "/", "PWA manifest scope");
assertEqual(webManifest.display, "standalone", "PWA manifest display");
assertEqual(webManifest.theme_color, "#000000", "PWA theme color");
assertEqual(webManifest.background_color, "#000000", "PWA background color");
assert(
  Array.isArray(webManifest.icons) &&
    webManifest.icons.some((icon) => icon.src === "/assets/hana-icon-512.png"),
  "PWA manifest must include the 512px Hana icon.",
);

assertIncludes(buildGradle, `applicationId "${productionPackageId}"`, "Gradle applicationId");
assertIncludes(buildGradle, `namespace "${productionPackageId}"`, "Gradle namespace");
assertIncludes(buildGradle, `hostName: '${productionHost}'`, "Gradle hostName");
assertIncludes(buildGradle, "launchUrl: '/app'", "Gradle launch URL");
assertIncludes(buildGradle, "minifyEnabled false", "Gradle release minification setting");
assertIncludes(stringsXml, `\\\"site\\\": \\\"${productionTwaOrigin}\\\"`, "asset statements site");
assertIncludes(androidManifest, 'android:scheme="https"', "Android HTTPS intent scheme");
assertIncludes(
  androidManifest,
  'android:host="@string/hostName"',
  "Android hostName intent binding",
);

const releaseConfigText = [
  JSON.stringify(manifest),
  JSON.stringify(webManifest),
  buildGradle,
  stringsXml,
  androidManifest,
].join("\n");
assert(
  !releaseConfigText.includes("18.61.174.6"),
  "TWA release config must not include the raw VPS IP.",
);
assert(
  !releaseConfigText.includes("http://app.hanachat.site"),
  "TWA release config must use HTTPS for app.hanachat.site.",
);

if (failures.length > 0) {
  console.error("Android TWA validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Android TWA config validated for ${productionTwaOrigin}.`);

function readText(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function checkOptionalOriginEnv(name) {
  const value = process.env[name];

  if (!value) {
    return;
  }

  assertEqual(normalizeOrigin(value), productionTwaOrigin, `${name} origin`);
}

function normalizeOrigin(value) {
  try {
    return new URL(value.trim().replace(/\/$/, "")).origin;
  } catch {
    failures.push(`Invalid URL in TWA origin value: ${value}`);
    return "";
  }
}

function assertUrlOrigin(value, expectedOrigin, label) {
  try {
    assertEqual(new URL(value).origin, expectedOrigin, label);
  } catch {
    failures.push(`${label} must be a valid absolute URL.`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    failures.push(`${label} must be ${expected}; got ${String(actual)}.`);
  }
}

function assertIncludes(value, expected, label) {
  assert(value.includes(expected), `${label} must include ${expected}.`);
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}
