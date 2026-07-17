"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";
import { StatCard, Card, StatusBadge, Banner, Swatch } from "@/components/ui";
import type { Node, Stats } from "@/lib/types";

export default function FleetPage() {
  const { data: stats } = usePoll<Stats>("/api/stats", 3000);
  const { data: nodes, error } = usePoll<Node[]>("/api/nodes", 3000);

  const gpuNodes = stats?.gpu_nodes ?? 0;
  const cpuNodes = stats?.cpu_only_nodes ?? 0;
  const composed = gpuNodes + cpuNodes;
  const gpuShare = composed > 0 ? Math.round((gpuNodes / composed) * 100) : 0;
  const cpuShare = composed > 0 ? 100 - gpuShare : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-colony-navy">Fleet overview</h1>

      {error && <Banner text={`Cannot reach the Coordinator: ${error}`} />}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Nodes online"
          value={String(stats?.online_nodes ?? 0)}
          hint={`${stats?.total_nodes ?? 0} registered`}
        />
        <StatCard
          label="Compute units"
          value={String(Math.round(stats?.total_compute_units ?? 0))}
          hint="normalized pool"
        />
        <StatCard
          label="GPU memory"
          value={`${stats?.total_gpu_memory_gb ?? 0} GB`}
          hint={`${gpuNodes} GPU nodes`}
        />
        <StatCard
          label="Active colonies"
          value={String(stats?.active_colonies ?? 0)}
          hint="running now"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Fleet composition">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="GPU nodes" value={String(gpuNodes)} />
            <Metric label="CPU only" value={String(cpuNodes)} />
            <Metric label="GPU memory" value={`${stats?.total_gpu_memory_gb ?? 0} GB`} />
          </div>

          <div className="mt-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-colony-softblue">
              <div className="h-full bg-colony-ice" style={{ width: `${gpuShare}%` }} />
              <div className="h-full bg-colony-mist" style={{ width: `${cpuShare}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-4">
              <Swatch color="bg-colony-ice" label={`GPU nodes ${gpuShare}%`} />
              <Swatch color="bg-colony-mist" label={`CPU only ${cpuShare}%`} />
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-colony-slate">
            One normalized pool. 1 CPU core = 1 unit, 1 GB RAM = 0.5, 1 GB GPU memory = 1.5, so CPU-heavy and
            GPU-heavy machines add to the same colony total.
          </p>
        </Card>

        <Card title="Status breakdown">
          <div className="space-y-2">
            <StatusRow
              status="ONLINE"
              label="Online"
              count={stats?.online_nodes ?? 0}
              total={stats?.total_nodes ?? 0}
            />
            <StatusRow
              status="BUSY"
              label="Busy"
              count={stats?.busy_nodes ?? 0}
              total={stats?.total_nodes ?? 0}
            />
            <StatusRow
              status="OFFLINE"
              label="Offline"
              count={stats?.offline_nodes ?? 0}
              total={stats?.total_nodes ?? 0}
            />
          </div>
        </Card>
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
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-colony-navy">{n.name}</span>
                  <StatusBadge status={n.status} />
                </div>
                <div className="mt-2 text-xs text-colony-slate">{n.os}</div>
                <div className="mt-1 truncate text-xs text-colony-slate">{n.resources.gpu_model || "No GPU"}</div>
                <div className="mt-2 flex items-baseline gap-1 border-t border-colony-mist pt-2">
                  <span className="text-sm font-semibold text-colony-navy">{Math.round(n.compute_units)}</span>
                  <span className="text-xs text-colony-slate">compute units</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-colony-mist bg-colony-lightblue p-3">
      <div className="text-xs uppercase tracking-wide text-colony-slate">{label}</div>
      <div className="mt-1 text-lg font-semibold text-colony-navy">{value}</div>
    </div>
  );
}

function StatusRow({ status, label, count, total }: { status: string; label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const active = status === "ONLINE";
  return (
    <div className="flex items-center gap-3">
      <StatusGlyph status={status} />
      <span className="w-16 text-sm text-colony-navy">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-colony-softblue">
        <div className={`h-full ${active ? "bg-colony-ice" : "bg-colony-mist"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-semibold text-colony-navy">{count}</span>
    </div>
  );
}

// StatusGlyph pairs a distinct shape per status with the allowed blues so status
// is never conveyed by color alone.
function StatusGlyph({ status }: { status: string }) {
  const active = status === "ONLINE";
  const stroke = active ? "text-colony-ice" : "text-colony-mist";
  if (status === "ONLINE") {
    return (
      <svg viewBox="0 0 16 16" className={`h-4 w-4 ${stroke}`} aria-hidden>
        <circle cx="8" cy="8" r="5" fill="currentColor" />
      </svg>
    );
  }
  if (status === "BUSY") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4 text-colony-ice" aria-hidden>
        <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 text-colony-mist" aria-hidden>
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
