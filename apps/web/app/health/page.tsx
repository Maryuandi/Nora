import { checkAll } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const results = await checkAll();
  return (
    <main>
      <h1>Health</h1>
      <ul>
        {results.map((r) => (
          <li key={r.name}>
            {r.name}: {r.ok ? "ok" : "error"} - {r.message}
          </li>
        ))}
      </ul>
    </main>
  );
}
