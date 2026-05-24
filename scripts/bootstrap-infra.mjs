import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function runDocker(args, input) {
  const result = spawnSync("docker", args, {
    cwd: root,
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });

  if (result.status !== 0) {
    const message = `${result.stderr || result.stdout}`.trim();
    throw new Error(`docker ${args.join(" ")} failed: ${message}`);
  }

  return result.stdout.trim();
}

async function putJson(url, body) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${await response.text()}`);
  }
}

async function ensureQdrantCollection(name) {
  const existing = await fetch(`http://localhost:6333/collections/${name}`);

  if (existing.ok) {
    return;
  }

  await putJson(`http://localhost:6333/collections/${name}`, {
    vectors: {
      size: 1536,
      distance: "Cosine",
    },
    optimizers_config: {
      default_segment_number: 2,
    },
    hnsw_config: {
      m: 32,
      ef_construct: 128,
    },
  });
}

function applyPostgresMigrations() {
  const migrationsDirectory = resolve(root, "infra/database/migrations");
  const migrations = readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const fileName of migrations) {
    const migration = readFileSync(resolve(migrationsDirectory, fileName), "utf8");
    runDocker(["exec", "-i", "hana-postgres", "psql", "-U", "hana", "-d", "hana"], migration);
  }
}

function applyNeo4jConstraints() {
  const constraints = readFileSync(resolve(root, "infra/neo4j/constraints.cypher"), "utf8");
  runDocker(
    ["exec", "-i", "hana-neo4j", "cypher-shell", "-u", "neo4j", "-p", "hana_neo4j_password"],
    constraints,
  );
}

async function applyClickHouseSchema() {
  const queries = [
    "CREATE DATABASE IF NOT EXISTS hana",
    `
CREATE TABLE IF NOT EXISTS hana.model_calls
(
  model_call_id String,
  created_at DateTime64(3),
  user_id String,
  provider LowCardinality(String),
  model LowCardinality(String),
  input_tokens UInt32,
  cached_input_tokens UInt32,
  output_tokens UInt32,
  estimated_cost_usd Decimal(12, 6),
  latency_ms UInt32
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (provider, model, created_at, model_call_id)
`,
    "ALTER TABLE hana.model_calls ADD COLUMN IF NOT EXISTS model_call_id String",
  ];

  for (const query of queries) {
    const response = await fetch(
      "http://localhost:8123/?user=hana&password=hana_clickhouse_password",
      {
        method: "POST",
        body: query,
      },
    );

    if (!response.ok) {
      throw new Error(`ClickHouse schema failed: HTTP ${response.status} ${await response.text()}`);
    }
  }
}

function ensureRedpandaTopic(topic) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "hana-redpanda",
      "rpk",
      "topic",
      "create",
      topic,
      "--brokers",
      "localhost:9092",
      "--partitions",
      "3",
    ],
    { cwd: root, encoding: "utf8" },
  );

  const output = `${result.stdout || ""}${result.stderr || ""}`;

  const normalizedOutput = output.toLowerCase();

  if (
    result.status !== 0 &&
    !normalizedOutput.includes("already exists") &&
    !normalizedOutput.includes("topic_already_exists")
  ) {
    throw new Error(`Redpanda topic ${topic} failed: ${output.trim()}`);
  }
}

applyPostgresMigrations();
await ensureQdrantCollection("hana_memory_facts");
await ensureQdrantCollection("hana_character_profiles");
applyNeo4jConstraints();
await applyClickHouseSchema();
[
  "chat.turn.requested",
  "memory.fact.extracted",
  "safety.decision.created",
  "billing.credit.changed",
  "model.call.logged",
  "analytics.event.created",
].forEach(ensureRedpandaTopic);

console.log("Hana infra bootstrap complete.");
