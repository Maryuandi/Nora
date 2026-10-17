import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Next only reads apps/web/.env*; also load the repo-root .env*. With forceReload=true the root values REPLACE apps/web/.env* ones (only the shell env survives).
loadEnvConfig(fileURLToPath(new URL("../..", import.meta.url)), process.env.NODE_ENV !== "production", console, true);

const config: NextConfig = { transpilePackages: ["@nora/contracts"] };
export default config;
