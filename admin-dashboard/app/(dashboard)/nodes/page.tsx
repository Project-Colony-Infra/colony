"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/client";
import { Card, StatusBadge, Banner } from "@/components/ui";
import type { Node } from "@/lib/types";

type SortKey = "name" | "os" | "status" | "cpu" | "ram" | "gpu" | "last_seen";

export default function NodesPage() {
  const { data: nodes, error } = usePoll<Node[]>("/api/nodes", 3000);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const list = (nodes ?? []).filter((n) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        n.os.toLowerCase().includes(q) ||
        n.resources.gpu_model.toLowerCase().includes(q)
      );
    });
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => dir * compare(a, b, sort));
  }, [nodes, query, sort, asc]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc(!asc);
    else {
      setSort(key);
      setAsc(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-colony-navy">Nodes</h1>
        <input
          placeholder="Search name, OS, or GPU"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64 rounded border border-colony-softblue bg-colony-lightblue px-3 py-1.5 text-sm outline-none focus:border-colony-ice"
        />
      </div>

      {error && <Banner text={`Cannot reach the Coordinator: ${error}`} />}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-colony-mist text-left text-xs uppercase tracking-wide text-colony-slate">
                <Th onClick={() => toggleSort("name")} active={sort === "name"} asc={asc}>Name</Th>
                <Th onClick={() => toggleSort("os")} active={sort === "os"} asc={asc}>OS</Th>
                <Th onClick={() => toggleSort("cpu")} active={sort === "cpu"} asc={asc}>CPU</Th>
                <Th onClick={() => toggleSort("ram")} active={sort === "ram"} asc={asc}>Memory</Th>
                <Th onClick={() => toggleSort("gpu")} active={sort === "gpu"} asc={asc}>GPU</Th>
                <Th onClick={() => toggleSort("status")} active={sort === "status"} asc={asc}>Status</Th>
                <Th onClick={() => toggleSort("last_seen")} active={sort === "last_seen"} asc={asc}>Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="border-b border-colony-mist last:border-0">
                  <td className="py-2">
                    <Link href={`/nodes/${n.id}`} className="font-medium text-colony-core hover:underline">
                      {n.name}
                    </Link>
                  </td>
                  <td className="py-2 text-colony-charcoal">{n.os}</td>
                  <td className="py-2 text-colony-charcoal">{n.allocated.cpu_cores} / {n.resources.cpu_cores}</td>
                  <td className="py-2 text-colony-charcoal">{n.allocated.ram_gb} / {n.resources.ram_gb} GB</td>
                  <td className="py-2 text-colony-charcoal">{n.resources.gpu_model || "None"}</td>
                  <td className="py-2"><StatusBadge status={n.status} /></td>
                  <td className="py-2 text-colony-slate">{formatSeen(n.last_seen)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-colony-slate">No nodes match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Th({ children, onClick, active, asc }: { children: React.ReactNode; onClick: () => void; active: boolean; asc: boolean }) {
  return (
    <th className="cursor-pointer select-none py-2 pr-4 font-semibold" onClick={onClick}>
      {children}
      {active && <span className="ml-1 text-colony-core">{asc ? "↑" : "↓"}</span>}
    </th>
  );
}

function compare(a: Node, b: Node, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "os": return a.os.localeCompare(b.os);
    case "status": return a.status.localeCompare(b.status);
    case "cpu": return a.allocated.cpu_cores - b.allocated.cpu_cores;
    case "ram": return a.allocated.ram_gb - b.allocated.ram_gb;
    case "gpu": return a.resources.gpu_model.localeCompare(b.resources.gpu_model);
    case "last_seen": return (a.last_seen || "").localeCompare(b.last_seen || "");
  }
}

function formatSeen(ts: string | null): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleTimeString();
}
