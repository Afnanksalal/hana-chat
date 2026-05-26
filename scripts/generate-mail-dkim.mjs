import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const force = args.includes("--force");
const positional = args.filter((arg) => !arg.startsWith("--"));
const domain = positional[0] ?? "app.hanachat.site";
const selector = positional[1] ?? "mail";
const defaultOutputDir =
  process.env.MAIL_DKIM_KEYS_DIR ??
  (process.platform === "win32"
    ? resolve("infra/mail/opendkim/keys")
    : "/opt/hana-chat/shared/opendkim-keys");
const outputDir = resolve(positional[2] ?? defaultOutputDir);

if (!/^[a-z0-9.-]+$/i.test(domain) || domain.includes("..")) {
  throw new Error(`Invalid DKIM domain: ${domain}`);
}

if (!/^[a-z0-9._-]+$/i.test(selector)) {
  throw new Error(`Invalid DKIM selector: ${selector}`);
}

mkdirSync(outputDir, { recursive: true });

const shell = [
  "set -eu",
  "apk add --no-cache opendkim-utils >/dev/null",
  "cd /keys",
  force
    ? `rm -f '${domain}.private' '${domain}.txt' '${selector}.private' '${selector}.txt'`
    : `test ! -e '${domain}.private' && test ! -e '${domain}.txt'`,
  `opendkim-genkey -b 2048 -h rsa-sha256 -r -v --subdomains -s '${selector}' -d '${domain}'`,
  `sed -i 's/h=rsa-sha256/h=sha256/' '${selector}.txt'`,
  `mv '${selector}.private' '${domain}.private'`,
  `mv '${selector}.txt' '${domain}.txt'`,
  `chmod 0400 '${domain}.private'`,
].join(" && ");

const result = spawnSync(
  "docker",
  ["run", "--rm", "-v", `${outputDir}:/keys`, "alpine:3.20", "sh", "-lc", shell],
  {
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  throw new Error(
    force
      ? "Failed to generate DKIM keys"
      : "Failed to generate DKIM keys. If keys already exist, rerun with --force to rotate them.",
  );
}

const dnsRecord = readFileSync(resolve(outputDir, `${domain}.txt`), "utf8").trim();

console.log("");
console.log(`DKIM private key: ${resolve(outputDir, `${domain}.private`)}`);
console.log(`Add this DNS TXT record for ${selector}._domainkey.${domain}:`);
console.log(dnsRecord);
