import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Next only reads apps/web/.env*; load the repo-root .env too (existing env wins; forceReload because Next already loaded apps/web).
loadEnvConfig(fileURLToPath(new URL("../..", import.meta.url)), process.env.NODE_ENV !== "production", console, true);

const config: NextConfig = { transpilePackages: ["@nora/contracts"] };
export default config;
