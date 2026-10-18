import { defineConfig } from "prisma/config";

// The CLI does not read .env itself; an already-set DATABASE_URL wins over the file.
try {
  process.loadEnvFile("../../.env");
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL! },
});
