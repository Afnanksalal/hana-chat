import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const release = parseRelease(process.argv.slice(2)) ?? timestampRelease();
const target = process.env.PLAYGROUND_SSH_TARGET ?? "ubuntu@18.61.174.6";
const sshKey = process.env.PLAYGROUND_SSH_KEY;
const remoteBase = process.env.PLAYGROUND_REMOTE_BASE ?? "/opt/hana-chat";
const projectName = process.env.PLAYGROUND_COMPOSE_PROJECT ?? "hana-chat-vps";
const tmpDir = resolve(root, "tmp", "deploy");
const manifestPath = resolve(tmpDir, `hana-chat-${release}.files`);
const archivePath = resolve(tmpDir, `hana-chat-${release}.tar`);
const remoteArchive = `/tmp/hana-chat-${release}.tar`;
const remoteScript = `/tmp/hana-chat-deploy-${release}.sh`;

mkdirSync(tmpDir, { recursive: true });

const files = listDeployFiles();
writeFileSync(manifestPath, `${files.join("\n")}\n`, "utf8");
run("tar", ["-cf", archivePath, "-T", manifestPath], "Create release archive");

const sshOptions = [
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "ServerAliveInterval=30",
  "-o",
  "ServerAliveCountMax=6",
];
const keyedSshOptions = sshKey ? ["-i", sshKey, ...sshOptions] : sshOptions;

run(
  "ssh",
  [...keyedSshOptions, target, "mkdir", "-p", `${remoteBase}/releases`, `${remoteBase}/shared`],
  "Prepare remote folders",
);
run(
  "scp",
  [...keyedSshOptions, archivePath, `${target}:${remoteArchive}`],
  "Upload release archive",
);

const localRemoteScript = resolve(tmpDir, `hana-chat-deploy-${release}.sh`);
writeLfFile(localRemoteScript, remoteDeployScript());
run(
  "scp",
  [...keyedSshOptions, localRemoteScript, `${target}:${remoteScript}`],
  "Upload LF deploy script",
);
run(
  "ssh",
  [
    ...keyedSshOptions,
    target,
    "bash",
    remoteScript,
    release,
    remoteBase,
    remoteArchive,
    projectName,
  ],
  "Run remote deploy",
);

console.log(`Deploy complete: ${release}`);

function parseRelease(args) {
  const explicit = args.find((arg) => arg.startsWith("--release="))?.slice("--release=".length);
  const positional = args.find((arg) => !arg.startsWith("-"));
  const value = explicit ?? process.env.HANA_RELEASE ?? positional;

  if (!value) {
    return null;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid release name "${value}"`);
  }

  return value;
}

function timestampRelease() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

function listDeployFiles() {
  const result = run(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    "Collect tracked and untracked deploy files",
    {
      capture: true,
    },
  );
  const files = result.stdout
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => existsSync(resolve(root, file)))
    .filter((file) => !file.startsWith("tmp/"))
    .filter((file) => !file.startsWith(".turbo/"))
    .filter((file) => !file.includes("/dist/"))
    .filter((file) => !file.includes("/.next/"));

  if (files.length === 0) {
    throw new Error("No files found for deployment archive");
  }

  return files;
}

function writeLfFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

function remoteDeployScript() {
  return `#!/usr/bin/env bash
set -Eeuo pipefail

release="\${1:?release is required}"
base="\${2:?base path is required}"
archive="\${3:?archive path is required}"
project_name="\${4:?compose project is required}"
release_dir="\${base}/releases/\${release}"
env_file="\${base}/shared/.env.vps"
compose_files=(-f docker-compose.vps.yml -f infra/deploy/playground/docker-compose.playground.yml)

if [ ! -f "\${env_file}" ]; then
  echo "Missing \${env_file}; create the VPS environment file before deploying." >&2
  exit 1
fi

rm -rf "\${release_dir}"
mkdir -p "\${release_dir}"
tar -xf "\${archive}" -C "\${release_dir}"
ln -sfn "\${release_dir}" "\${base}/current"

cd "\${base}/current"
set -a
. "\${env_file}"
set +a
export HANA_ENV_FILE="\${env_file}"
mkdir -p "\${MAIL_DKIM_KEYS_DIR:-\${base}/shared/opendkim-keys}"

docker compose "\${compose_files[@]}" --project-name "\${project_name}" config >/tmp/hana-chat-compose-\${release}.yml
docker compose "\${compose_files[@]}" --project-name "\${project_name}" up -d postgres

for attempt in {1..30}; do
  if docker compose "\${compose_files[@]}" --project-name "\${project_name}" exec -T postgres pg_isready -U "\${POSTGRES_USER:-hana}" -d "\${POSTGRES_DATABASE:-hana}" >/dev/null 2>&1; then
    break
  fi

  if [ "\${attempt}" -eq 30 ]; then
    echo "Postgres did not become ready for migrations." >&2
    exit 1
  fi

  sleep 2
done

for migration in infra/database/migrations/*.sql; do
  echo "Applying \${migration}"
  docker compose "\${compose_files[@]}" --project-name "\${project_name}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "\${POSTGRES_USER:-hana}" -d "\${POSTGRES_DATABASE:-hana}" < "\${migration}"
done

docker compose "\${compose_files[@]}" --project-name "\${project_name}" up -d --build
docker compose "\${compose_files[@]}" --project-name "\${project_name}" ps

curl -fsS http://127.0.0.1:\${WEB_PORT:-3000}/ >/dev/null
curl -fsS http://127.0.0.1:\${API_GATEWAY_PORT:-4000}/health >/dev/null
rm -f "\${archive}" "\$0"
`;
}

function run(command, args, label, options = {}) {
  console.log(`${label}...`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = options.capture ? result.stderr : "";
    throw new Error(`${label} failed with exit ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }

  return {
    stdout: options.capture ? result.stdout : "",
    stderr: options.capture ? result.stderr : "",
  };
}
