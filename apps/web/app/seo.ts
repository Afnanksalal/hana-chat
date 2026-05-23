export const siteName = "Hana Chat";

export const siteDescription =
  "Chat with anime-inspired AI characters, create private stories, and return to conversations that remember your world.";

export const siteKeywords = [
  "AI roleplay",
  "AI companion",
  "anime chat",
  "character chat",
  "AI characters",
  "persistent memory chat",
  "Hana Chat",
];

export function getSiteUrl(): string {
  return (
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    process.env["WEB_ORIGIN"] ??
    "https://hanachat.live"
  )
    .trim()
    .replace(/\/$/, "");
}

export function getAppUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://app.hanachat.live")
    .trim()
    .replace(/\/$/, "");
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function absoluteAppUrl(path: string): string {
  return new URL(path, `${getAppUrl()}/`).toString();
}
