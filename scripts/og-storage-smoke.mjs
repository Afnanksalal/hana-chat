import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";

loadDotEnv(resolve(process.cwd(), ".env"));

const bridgePath = resolve(process.cwd(), "packages/og-bridge/dist/index.js");

if (!existsSync(bridgePath)) {
  console.error(
    "Missing packages/og-bridge/dist/index.js. Run pnpm --filter @hana/og-bridge build.",
  );
  process.exit(1);
}

const { downloadEncryptedMemorySnapshotFrom0g, uploadEncryptedMemorySnapshotTo0g } = await import(
  pathToFileUrl(bridgePath)
);

const network = process.env.OG_NETWORK ?? "testnet";
const rpcUrl = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const indexerUrl =
  process.env.OG_STORAGE_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai";
const keyRef = process.env.OG_SERVER_WALLET_KEY_REF || "env:OG_STORAGE_SIGNER_PRIVATE_KEY";
const dryRun = process.argv.includes("--dry-run");
const now = new Date().toISOString();
const userId = randomUUID();
const characterId = randomUUID();
const conversationId = randomUUID();

if (dryRun) {
  console.log("0G storage smoke dry run passed.");
  console.log(JSON.stringify({ network, rpcUrl, indexerUrl, keyRef }, null, 2));
  process.exit(0);
}

const signerPrivateKey = resolvePrivateKey(keyRef);

console.log(`Uploading encrypted dummy memory snapshot to 0G ${network}...`);

const upload = await uploadEncryptedMemorySnapshotTo0g(
  {
    snapshotKind: "conversation_memory",
    network,
    userId,
    characterId,
    conversationId,
    createdAt: now,
    facts: [
      {
        id: randomUUID(),
        kind: "preference",
        importance: 0.91,
        emotionalWeight: 0.42,
        updatedAt: now,
        text: "Dummy 0G smoke-test memory. This is not user data.",
        sourceMessageIds: [randomUUID()],
      },
    ],
  },
  {
    rpcUrl,
    indexerUrl,
    signerPrivateKey,
    encryptionKeyRef: keyRef,
  },
);

console.log("Upload complete.");
console.log(
  JSON.stringify(
    {
      rootHash: upload.rootHash,
      txHash: upload.txHash,
      manifestHash: upload.manifestHash,
      payloadHash: upload.payloadHash,
      signerAddress: upload.signerAddress,
    },
    null,
    2,
  ),
);

console.log("Downloading with proof and ECIES decryption...");

const downloaded = await downloadEncryptedMemorySnapshotFrom0g({
  indexerUrl,
  rootHash: upload.rootHash,
  signerPrivateKey,
  verifyProof: true,
});

if (downloaded.manifest.conversationId !== conversationId || downloaded.facts.length !== 1) {
  throw new Error("0G smoke download returned the wrong snapshot payload");
}

console.log("0G encrypted upload/download smoke passed.");

function resolvePrivateKey(keyRef) {
  if (!keyRef.startsWith("env:")) {
    throw new Error(
      "Only env: key refs are supported by the smoke script. Example: OG_SERVER_WALLET_KEY_REF=env:OG_STORAGE_SIGNER_PRIVATE_KEY",
    );
  }

  const envName = keyRef.slice("env:".length);
  const value = process.env[envName]?.trim();

  if (!value) {
    throw new Error(
      `Missing ${envName}. Set a funded 0G testnet private key in the shell, not in git.`,
    );
  }

  return value;
}

function loadDotEnv(path) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function pathToFileUrl(path) {
  const normalized = path.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";

  return `${prefix}${normalized}`;
}
