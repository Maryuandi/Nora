import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { MODULES } from "@/lib/modules";

export default function ModulesPage() {
  return (
    <>
      <PageHeader title="Modul" />
      <ul className="mx-8 my-6 divide-y divide-line rounded-lg border border-line bg-white">
        {MODULES.map((m) => (
          <li key={m.id}>
            <Link href={`/${m.id}`} className="flex gap-3 px-4 py-3 text-sm hover:bg-canvas">
              <span className="w-10 font-medium text-ink-3">{m.id.toUpperCase()}</span>
              <span>{m.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
