"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";
import { Card, Banner } from "@/components/ui";
import type { Job, Node } from "@/lib/types";

export default function JobPage({ params }: { params: { id: string } }) {
  const { data: job, error } = usePoll<Job>(`/api/jobs/${params.id}`, 1500);
  const { data: nodes } = usePoll<Node[]>("/api/nodes", 2000);

  const nodeById = (id: string) => (nodes ?? []).find((n) => n.id === id);
  const primary = job ? nodeById(job.primary_node_id) : undefined;
  const secondary = job ? nodeById(job.secondary_node_id) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/colonies" className="text-sm text-colony-core hover:underline">Zones</Link>
        <span className="text-colony-mist">/</span>
        <h1 className="text-xl font-semibold text-colony-navy">LLM job</h1>
        {job && <JobStatus status={job.status} />}
      </div>

      {error && <Banner text={`Cannot load this job: ${error}`} />}

      {job && (
        <>
          <Card title="Prompt">
            <p className="text-sm text-colony-charcoal">{job.prompt}</p>
            <p className="mt-2 text-xs text-colony-slate">Engine {job.engine} · Model {job.model}</p>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <WorkerCard title="Primary node (lower layers)" node={primary} />
            <WorkerCard title="Secondary node (upper layers)" node={secondary} />
          </div>

          <Card title="Result">
            {job.status === "DONE" ? (
              <p className="whitespace-pre-wrap text-sm text-colony-charcoal">
                <span className="text-colony-slate">{job.prompt}</span> {job.result}
              </p>
            ) : job.status === "FAILED" ? (
              <p className="text-sm text-colony-indigo">{job.error || "The job failed."}</p>
            ) : (
              <p className="text-sm text-colony-slate">
                Waiting for the split inference to finish. The primary node is relaying activation tensors through the Coordinator to the secondary node.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function JobStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-colony-mist text-colony-navy",
    RUNNING: "bg-colony-softblue text-colony-deep",
    DONE: "bg-colony-ice text-colony-midnight",
    FAILED: "bg-colony-indigo text-colony-cloud",
  };
  const cls = map[status] ?? "bg-colony-mist text-colony-navy";
  return <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

function WorkerCard({ title, node }: { title: string; node?: Node }) {
  return (
    <Card title={title}>
      {node ? (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-colony-slate">Node</span><span>{node.name}</span></div>
          <div className="flex justify-between"><span className="text-colony-slate">Status</span><span>{node.status}</span></div>
          <div className="flex justify-between"><span className="text-colony-slate">CPU in use</span><span className="font-mono text-xs">{node.utilization.cpu_used.toFixed(1)} cores</span></div>
          <div className="flex justify-between"><span className="text-colony-slate">GPU memory</span><span className="font-mono text-xs">{node.utilization.gpu_mem_used_gb.toFixed(1)} GB</span></div>
        </div>
      ) : (
        <p className="text-sm text-colony-slate">Node not found.</p>
      )}
    </Card>
  );
}
