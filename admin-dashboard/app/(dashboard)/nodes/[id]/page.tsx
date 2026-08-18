"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";
import { Card, StatusBadge, LevelBadge, Banner } from "@/components/ui";
import type { Node, NodeError } from "@/lib/types";

export default function NodeDetailPage({ params }: { params: { id: string } }) {
  const { data: node, error } = usePoll<Node>(`/api/nodes/${params.id}`, 3000);
  const { data: errors } = usePoll<NodeError[]>("/api/errors?limit=200", 4000);

  const nodeErrors = (errors ?? []).filter((e) => e.node_id === params.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/nodes" className="text-sm text-colony-core hover:underline">Nodes</Link>
        <span className="text-colony-mist">/</span>
        <h1 className="text-xl font-semibold text-colony-navy">{node?.name ?? params.id}</h1>
        {node && <StatusBadge status={node.status} />}
      </div>

      {error && <Banner text={`Cannot load this node: ${error}`} />}

      {node && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Hardware">
            <Info label="System" value={node.os} />
            <Info label="Architecture" value={node.arch} />
            <Info label="CPU" value={`${node.resources.cpu_cores} cores`} />
            <Info label="Memory" value={`${node.resources.ram_gb} GB`} />
            <Info label="Disk" value={`${node.resources.disk_gb} GB`} />
            <Info label="GPU" value={node.resources.gpu_model || "None"} />
          </Card>
          <Card title="Donated and live">
            <Info label="CPU donated" value={`${node.allocated.cpu_cores} cores`} />
            <Info label="Memory donated" value={`${node.allocated.ram_gb} GB`} />
            <Info label="GPU memory donated" value={`${node.allocated.gpu_memory_gb} GB`} />
            <Info label="CPU in use" value={`${node.utilization.cpu_used.toFixed(1)} cores`} />
            <Info label="Memory in use" value={`${node.utilization.ram_used_gb.toFixed(1)} GB`} />
            <Info label="Zone" value={node.colony_id || "None"} mono={!!node.colony_id} />
            <Info label="Score" value={node.contribution_score.toFixed(0)} />
          </Card>
        </div>
      )}

      <Card title="Error history">
        {nodeErrors.length === 0 ? (
          <p className="text-sm text-colony-slate">No issues reported for this node.</p>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {nodeErrors.map((e) => (
              <div key={e.id} className="flex gap-3 border-b border-colony-mist py-1.5 last:border-0">
                <span className="shrink-0 text-colony-slate">{new Date(e.ts).toLocaleTimeString()}</span>
                <LevelBadge level={e.level} />
                <span className="text-colony-charcoal">{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-colony-slate">{label}</span>
      <span className={`text-right text-colony-charcoal ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
