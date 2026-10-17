import Link from "next/link";
import { MODULES } from "@/lib/modules";

export default function Home() {
  return (
    <main>
      <h1>Nora</h1>
      <ul>
        {MODULES.map((m) => (
          <li key={m.id}>
            <Link href={`/${m.id}`}>
              {m.id.toUpperCase()} - {m.title}
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/health">Health</Link>
      </p>
    </main>
  );
}
