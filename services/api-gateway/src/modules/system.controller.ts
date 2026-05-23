import { loadConfig, type AppConfig } from "@hana/config";
import { checkDatabaseConnection } from "@hana/database";
import { Controller, Get } from "@nestjs/common";
import { Socket } from "node:net";

type ReadinessStatus = "ok" | "degraded";

interface DependencyCheck {
  name: string;
  status: ReadinessStatus;
  latencyMs: number;
  target: string;
  detail?: string;
}

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

async function checkTcp(name: string, host: string, port: number): Promise<DependencyCheck> {
  const startedAt = Date.now();
  const target = `${host}:${port}`;

  return new Promise((resolve) => {
    const socket = new Socket();
    let finished = false;

    const finish = (status: ReadinessStatus, detail?: string): void => {
      if (finished) {
        return;
      }

      finished = true;
      socket.destroy();
      resolve({
        name,
        status,
        latencyMs: elapsedSince(startedAt),
        target,
        ...(detail ? { detail } : {}),
      });
    };

    socket.setTimeout(2_000);
    socket.once("connect", () => finish("ok"));
    socket.once("timeout", () => finish("degraded", "connection timed out"));
    socket.once("error", (error) => finish("degraded", error.message));
    socket.connect(port, host);
  });
}

async function checkHttp(name: string, url: string): Promise<DependencyCheck> {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_500) });

    return {
      name,
      status: response.ok ? "ok" : "degraded",
      latencyMs: elapsedSince(startedAt),
      target: url,
      ...(!response.ok ? { detail: `HTTP ${response.status}` } : {}),
    };
  } catch (error) {
    return {
      name,
      status: "degraded",
      latencyMs: elapsedSince(startedAt),
      target: url,
      detail: error instanceof Error ? error.message : "request failed",
    };
  }
}

function parseHostPort(value: string, fallbackPort: number): { host: string; port: number } {
  const [host = "localhost", rawPort] = value.replace(/^.*:\/\//, "").split(":");
  return {
    host,
    port: rawPort ? Number.parseInt(rawPort, 10) : fallbackPort,
  };
}

function clickHouseQueryUrl(config: AppConfig): string {
  const url = new URL(config.CLICKHOUSE_URL);
  url.searchParams.set("user", config.CLICKHOUSE_USER);
  url.searchParams.set("password", config.CLICKHOUSE_PASSWORD);
  return url.toString();
}

async function checkClickHouse(config: AppConfig): Promise<DependencyCheck> {
  const startedAt = Date.now();
  const target = clickHouseQueryUrl(config);

  try {
    const response = await fetch(target, {
      method: "POST",
      body: "SELECT 1",
      signal: AbortSignal.timeout(2_500),
    });

    return {
      name: "clickhouse",
      status: response.ok ? "ok" : "degraded",
      latencyMs: elapsedSince(startedAt),
      target: config.CLICKHOUSE_URL,
      ...(!response.ok ? { detail: `HTTP ${response.status}` } : {}),
    };
  } catch (error) {
    return {
      name: "clickhouse",
      status: "degraded",
      latencyMs: elapsedSince(startedAt),
      target: config.CLICKHOUSE_URL,
      detail: error instanceof Error ? error.message : "query failed",
    };
  }
}

@Controller("/v1/system")
export class SystemController {
  private readonly config = loadConfig();

  @Get("/readiness")
  public async readiness(): Promise<{
    status: ReadinessStatus;
    time: string;
    dependencies: Array<Pick<DependencyCheck, "name" | "status" | "latencyMs">>;
  }> {
    const redisTarget = parseHostPort(this.config.REDIS_URL, 6379);
    const neo4jTarget = parseHostPort(this.config.NEO4J_URI, 7687);
    const [redpandaBroker = "localhost:19092"] = this.config.REDPANDA_BROKERS.split(",");
    const redpandaTarget = parseHostPort(redpandaBroker, 19_092);
    const temporalTarget = parseHostPort(this.config.TEMPORAL_ADDRESS, 7_233);
    const postgresStartedAt = Date.now();

    const dependencies = await Promise.all([
      checkDatabaseConnection(this.config)
        .then(
          (): DependencyCheck => ({
            name: "postgres",
            status: "ok",
            latencyMs: elapsedSince(postgresStartedAt),
            target: `${this.config.POSTGRES_HOST}:${this.config.POSTGRES_PORT}/${this.config.POSTGRES_DATABASE}`,
          }),
        )
        .catch(
          (error: unknown): DependencyCheck => ({
            name: "postgres",
            status: "degraded",
            latencyMs: elapsedSince(postgresStartedAt),
            target: `${this.config.POSTGRES_HOST}:${this.config.POSTGRES_PORT}/${this.config.POSTGRES_DATABASE}`,
            detail: error instanceof Error ? error.message : "query failed",
          }),
        ),
      checkTcp("redis", redisTarget.host, redisTarget.port),
      checkHttp("qdrant", new URL("/collections", this.config.QDRANT_URL).toString()),
      checkTcp("neo4j", neo4jTarget.host, neo4jTarget.port),
      checkTcp("redpanda", redpandaTarget.host, redpandaTarget.port),
      checkClickHouse(this.config),
      checkTcp("temporal", temporalTarget.host, temporalTarget.port),
    ]);

    return {
      status: dependencies.every((dependency) => dependency.status === "ok") ? "ok" : "degraded",
      time: new Date().toISOString(),
      dependencies: dependencies.map((dependency) => ({
        name: dependency.name,
        status: dependency.status,
        latencyMs: dependency.latencyMs,
      })),
    };
  }
}
