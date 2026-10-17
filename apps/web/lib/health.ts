import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import neo4j from "neo4j-driver";
import { Client } from "pg";
import { getTemporalClient } from "./temporal";

const TIMEOUT_MS = 2000;

export type ServiceName = "postgres" | "neo4j" | "minio" | "temporal";
export type HealthResult = { name: ServiceName; ok: boolean; message: string };
export type Checkers = Record<ServiceName, () => Promise<string>>;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// Each real checker also sets its own client-side timeout so a hung connect
// settles soon after the outer 2s limit and its `finally` still closes the resource.
export const defaultCheckers: Checkers = {
  async postgres() {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: TIMEOUT_MS,
      query_timeout: TIMEOUT_MS,
    });
    client.on("error", () => {}); // a dropped connection must not crash the server
    try {
      await client.connect();
      await client.query("SELECT 1");
      return "SELECT 1 ok";
    } finally {
      await client.end().catch(() => {});
    }
  },
  async neo4j() {
    const driver = neo4j.driver(
      process.env.NEO4J_URI ?? "",
      neo4j.auth.basic(process.env.NEO4J_USER ?? "", process.env.NEO4J_PASSWORD ?? ""),
      { connectionTimeout: TIMEOUT_MS, connectionAcquisitionTimeout: TIMEOUT_MS },
    );
    try {
      await driver.verifyConnectivity();
      return "connectivity verified";
    } finally {
      await driver.close().catch(() => {});
    }
  },
  async minio() {
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
    try {
      await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }), {
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return `bucket ${process.env.S3_BUCKET} reachable`;
    } finally {
      s3.destroy();
    }
  },
  async temporal() {
    // Shared singleton client (see temporal.ts); intentionally not closed here.
    const client = await getTemporalClient();
    await client.workflowService.getSystemInfo({});
    return "getSystemInfo ok";
  },
};

export async function checkAll(checkers: Checkers = defaultCheckers): Promise<HealthResult[]> {
  const names: ServiceName[] = ["postgres", "neo4j", "minio", "temporal"];
  const settled = await Promise.allSettled(names.map((n) => withTimeout(checkers[n](), TIMEOUT_MS)));
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? { name: names[i]!, ok: true, message: s.value }
      : { name: names[i]!, ok: false, message: s.reason instanceof Error ? s.reason.message : String(s.reason) },
  );
}
