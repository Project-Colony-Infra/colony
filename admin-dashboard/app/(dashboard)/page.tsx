"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";
import { StatCard, Card, StatusBadge, Banner } from "@/components/ui";
import type { Node, Stats } from "@/lib/types";

export default function FleetPage() {
  const { data: stats } = usePoll<Stats>("/api/stats", 3000);
  const { data: nodes, error } = usePoll<Node[]>("/api/nodes", 3000);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-colony-navy">Fleet overview</h1>

      {error && <Banner text={`Cannot reach the Coordinator: ${error}`} />}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Nodes" value={String(stats?.total_nodes ?? 0)} hint={`${stats?.online_nodes ?? 0} online`} />
        <StatCard label="CPU cores" value={String(stats?.total_cpu_cores ?? 0)} hint="donated, online" />
        <StatCard label="Memory" value={`${stats?.total_ram_gb ?? 0} GB`} hint="donated, online" />
        <StatCard label="GPUs" value={String(stats?.total_gpus ?? 0)} hint="online" />
      </div>

      <Card title="Nodes">
        {!nodes || nodes.length === 0 ? (
          <p className="text-sm text-colony-slate">No nodes have registered yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {nodes.map((n) => (
              <Link
                key={n.id}
                href={`/nodes/${n.id}`}
                className="rounded-md border border-colony-mist bg-colony-cloud p-3 hover:border-colony-ice"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-colony-navy">{n.name}</span>
                  <StatusBadge status={n.status} />
                </div>
                <div className="mt-2 text-xs text-colony-slate">{n.os}</div>
                <div className="mt-1 truncate text-xs text-colony-slate">
                  {n.resources.gpu_model || "No GPU"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
