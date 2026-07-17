"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, usePoll } from "@/lib/client";
import { Card, Banner } from "@/components/ui";
import type { Colony, Job, Node } from "@/lib/types";

// The Playground is a friendly place to run the split LLM inference test and watch
// the whole colony work together. The task the user types is the prompt the model
// answers. It is not a general code runner.

const PRESETS = [
  "Explain what a compute colony is in one paragraph",
  "Write a haiku about many computers working as one",
  "List three uses for distributed inference",
  "Summarize how split inference works",
  "Give a friendly welcome message for a new contributor",
  "Explain GPU vs CPU contribution simply",
];

// A node counts as online for the test when it is not OFFLINE (ONLINE or BUSY
// both mean it is heartbeating and can take work).
function isOnline(node: Node | undefined): boolean {
  return !!node && node.status !== "OFFLINE";
}

export default function PlaygroundPage() {
  const { data: colonies, error: coloniesError } = usePoll<Colony[]>("/api/colonies", 3000);
  const { data: nodes } = usePoll<Node[]>("/api/nodes", 2000);
  const { data: jobs } = usePoll<Job[]>("/api/jobs", 3000);

  const [colonyId, setColonyId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [engine, setEngine] = useState("mock");
  const [model, setModel] = useState("mock-3b");
  const [maxTokens, setMaxTokens] = useState(20);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const nodeById = useMemo(() => {
    const m = new Map<string, Node>();
    (nodes ?? []).forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const onlineCountFor = useMemo(() => {
    return (c: Colony) => c.node_ids.filter((id) => isOnline(nodeById.get(id))).length;
  }, [nodeById]);

  // Pick a sensible default colony once colonies load: prefer one that can run the
  // test (two or more online nodes), otherwise the first colony.
  useEffect(() => {
    if (colonyId || !colonies || colonies.length === 0) return;
    const ready = colonies.find((c) => onlineCountFor(c) >= 2);
    setColonyId((ready ?? colonies[0]).id);
  }, [colonies, colonyId, onlineCountFor]);

  const selected = (colonies ?? []).find((c) => c.id === colonyId);
  const selectedOnline = selected ? onlineCountFor(selected) : 0;
  const canRun = !!selected && selectedOnline >= 2 && prompt.trim().length > 0 && !busy;

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    setSubmitError("");
    try {
      const job = await api<Job>(`/api/colonies/${selected.id}/deploy-llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: model.trim() || "mock-3b",
          engine,
          max_new_tokens: maxTokens,
        }),
      });
      setJobId(job.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not start the run");
    } finally {
      setBusy(false);
    }
  };

  const noColonies = colonies && colonies.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-colony-navy">Playground</h1>
        <p className="mt-1 text-sm text-colony-slate">
          Run the split inference test and watch the colony work as one. Your task is the prompt the
          language model answers. The primary node computes the lower layers and relays the activation
          tensor through the Coordinator to the secondary node, which finishes and returns the text.
        </p>
      </div>

      {coloniesError && <Banner text={`Cannot reach the Coordinator: ${coloniesError}`} />}

      {noColonies ? (
        <Card title="No colonies yet">
          <p className="text-sm text-colony-slate">
            You need a colony of at least two online nodes to run the test.{" "}
            <Link href="/colonies" className="text-colony-core hover:underline">
              Create one on the Colonies page
            </Link>
            , then come back here.
          </p>
        </Card>
      ) : (
        <Card title="Compose a run">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-colony-slate">Colony</label>
              <select
                value={colonyId}
                onChange={(e) => setColonyId(e.target.value)}
                className="w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
              >
                {(colonies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({onlineCountFor(c)} of {c.node_ids.length} online)
                  </option>
                ))}
              </select>
              {selected && selectedOnline < 2 && (
                <p className="mt-1.5 text-xs text-colony-indigo">
                  This test needs at least two online nodes in the colony. {selected.name} has{" "}
                  {selectedOnline}.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm text-colony-slate">Engine</label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
                className="w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
              >
                <option value="mock">mock (no model download, proves the pipeline)</option>
                <option value="real">real (runs a small model on CPU, slower)</option>
              </select>
              <p className="mt-1.5 text-xs text-colony-slate">
                {engine === "real"
                  ? "For real, try microsoft/Phi-3-mini-4k-instruct in the model field."
                  : "Mock relays a stand-in tensor so you can watch the full path without a download."}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-colony-slate">Preset tasks</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="rounded-full border border-colony-softblue bg-colony-lightblue px-3 py-1 text-xs text-colony-deep hover:border-colony-ice"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-colony-slate">Task (the prompt the model answers)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Type the prompt the language model will answer, or pick a preset above"
              className="w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 font-mono text-sm outline-none focus:border-colony-ice"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-colony-slate">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="mock-3b"
                className="w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 font-mono text-sm outline-none focus:border-colony-ice"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-colony-slate">Max new tokens</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxTokens}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isNaN(v)) return;
                  setMaxTokens(Math.min(200, Math.max(1, Math.round(v))));
                }}
                className="w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 font-mono text-sm outline-none focus:border-colony-ice"
              />
            </div>
          </div>

          {submitError && <p className="mt-3 text-sm text-colony-indigo">{submitError}</p>}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={run}
              disabled={!canRun}
              className="rounded bg-colony-core px-4 py-2 text-sm font-medium text-colony-cloud hover:bg-colony-deep disabled:opacity-60"
            >
              {busy ? "Starting..." : "Run on the Colony"}
            </button>
            {selected && selectedOnline >= 2 && !busy && (
              <span className="text-xs text-colony-slate">
                Ready with {selectedOnline} online nodes in {selected.name}.
              </span>
            )}
          </div>
        </Card>
      )}

      {jobId && <LiveRun jobId={jobId} nodes={nodes ?? []} />}

      <RecentRuns jobs={jobs ?? []} colonies={colonies ?? []} onLoad={setJobId} />
    </div>
  );
}

function LiveRun({ jobId, nodes }: { jobId: string; nodes: Node[] }) {
  const { data: job, error } = usePoll<Job>(`/api/jobs/${jobId}`, 1500);

  const nodeById = (id: string) => nodes.find((n) => n.id === id);
  const primary = job ? nodeById(job.primary_node_id) : undefined;
  const secondary = job ? nodeById(job.secondary_node_id) : undefined;

  return (
    <Card
      title="Live run"
      action={job ? <JobStatus status={job.status} /> : undefined}
    >
      {error && <Banner text={`Cannot load this run: ${error}`} />}

      {!job ? (
        <p className="text-sm text-colony-slate">Loading the run...</p>
      ) : (
        <div className="space-y-4">
          <p className="font-mono text-xs text-colony-slate">Job {job.id}</p>

          {/* Pipeline: primary node, tensor relay, secondary node, left to right. */}
          <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            <PipeNode label="Primary node" sublabel="lower layers" node={primary} />
            <FlowArrow />
            <RelayStage active={job.status === "RUNNING"} />
            <FlowArrow />
            <PipeNode label="Secondary node" sublabel="upper layers" node={secondary} />
          </div>

          <Contribution primary={primary} secondary={secondary} />

          <div className="rounded-md border border-colony-mist bg-colony-lightblue p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-colony-slate">Result</div>
            {job.status === "DONE" ? (
              <p className="whitespace-pre-wrap text-sm text-colony-charcoal">
                <span className="text-colony-slate">{job.prompt}</span> {job.result}
              </p>
            ) : job.status === "FAILED" ? (
              <p className="whitespace-pre-wrap text-sm text-colony-indigo">
                {job.error || "The run failed."}
              </p>
            ) : (
              <p className="text-sm text-colony-slate">
                The primary node is relaying activation tensors through the Coordinator to the secondary
                node.
              </p>
            )}
          </div>

          <p className="text-xs text-colony-slate">
            Engine {job.engine} · Model {job.model} ·{" "}
            <Link href={`/jobs/${job.id}`} className="text-colony-core hover:underline">
              open the full monitor
            </Link>
          </p>
        </div>
      )}
    </Card>
  );
}

function PipeNode({ label, sublabel, node }: { label: string; sublabel: string; node?: Node }) {
  return (
    <div className="flex-1 rounded-md border border-colony-mist bg-colony-nearwhite p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-colony-navy">{label}</div>
          <div className="text-xs text-colony-slate">{sublabel}</div>
        </div>
        <StatusPill status={node?.status ?? "OFFLINE"} present={!!node} />
      </div>
      {node ? (
        <div className="mt-3 space-y-1 text-xs">
          <div className="truncate font-medium text-colony-charcoal">{node.name}</div>
          <Row label="CPU in use" value={`${node.utilization.cpu_used.toFixed(1)} cores`} />
          <Row label="Memory in use" value={`${node.utilization.ram_used_gb.toFixed(1)} GB`} />
          <Row label="Compute units" value={String(Math.round(node.compute_units))} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-colony-slate">Waiting for the node assignment.</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-colony-slate">{label}</span>
      <span className="font-mono text-colony-charcoal">{value}</span>
    </div>
  );
}

// RelayStage is the visually distinct middle of the pipeline: the Coordinator
// forwarding the activation tensor between nodes.
function RelayStage({ active }: { active: boolean }) {
  return (
    <div className="rounded-md border border-colony-ice bg-colony-paleblue px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-2">
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-colony-deep" aria-hidden>
          {active ? (
            <circle cx="8" cy="8" r="5" fill="currentColor" />
          ) : (
            <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
          )}
        </svg>
        <span className="text-sm font-semibold text-colony-midnight">Coordinator</span>
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-colony-deep">tensor relay</div>
    </div>
  );
}

// FlowArrow shows the direction of data flow between pipeline stages.
function FlowArrow() {
  return (
    <div className="flex items-center justify-center text-colony-slate">
      <svg viewBox="0 0 24 12" className="h-3 w-8 rotate-90 lg:rotate-0" aria-hidden>
        <path d="M0 6 H18 M13 1 L18 6 L13 11" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}

function Contribution({ primary, secondary }: { primary?: Node; secondary?: Node }) {
  const parts = [
    { role: "Primary", node: primary },
    { role: "Secondary", node: secondary },
  ].filter((p) => p.node);
  if (parts.length === 0) return null;
  return (
    <div className="rounded-md border border-colony-mist bg-colony-lightblue p-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-colony-slate">Contribution</div>
      <p className="text-xs text-colony-slate">
        {parts.map((p, i) => (
          <span key={p.role}>
            {i > 0 && " · "}
            <span className="font-medium text-colony-charcoal">{p.node?.name}</span> ({p.role}) is putting{" "}
            {Math.round(p.node?.compute_units ?? 0)} compute units toward this task, currently at{" "}
            {p.node?.utilization.cpu_used.toFixed(1)} CPU cores and{" "}
            {p.node?.utilization.ram_used_gb.toFixed(1)} GB memory.
          </span>
        ))}
      </p>
    </div>
  );
}

function RecentRuns({
  jobs,
  colonies,
  onLoad,
}: {
  jobs: Job[];
  colonies: Colony[];
  onLoad: (id: string) => void;
}) {
  const colonyName = (id: string) => colonies.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  if (jobs.length === 0) {
    return (
      <Card title="Recent runs">
        <p className="text-sm text-colony-slate">No runs yet. Compose one above to get started.</p>
      </Card>
    );
  }
  return (
    <Card title="Recent runs">
      <div className="divide-y divide-colony-mist">
        {jobs.slice(0, 8).map((j) => (
          <div key={j.id} className="flex items-center gap-3 py-2.5">
            <button
              type="button"
              onClick={() => onLoad(j.id)}
              className="font-mono text-xs text-colony-core hover:underline"
              title="Load into the live view"
            >
              {j.id.slice(0, 10)}
            </button>
            <span className="rounded bg-colony-softblue px-2 py-0.5 text-xs text-colony-deep">
              {colonyName(j.colony_id)}
            </span>
            <JobStatus status={j.status} />
            <span className="flex-1 truncate text-xs text-colony-slate">{j.prompt}</span>
            <Link href={`/jobs/${j.id}`} className="text-xs text-colony-core hover:underline">
              monitor
            </Link>
          </div>
        ))}
      </div>
    </Card>
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

// StatusPill conveys node status with a shape and a text label plus the allowed
// blues, never color alone.
function StatusPill({ status, present }: { status: string; present: boolean }) {
  const online = present && status !== "OFFLINE";
  const cls = online ? "bg-colony-ice text-colony-midnight" : "bg-colony-mist text-colony-navy";
  const text = !present ? "Unassigned" : status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <svg viewBox="0 0 16 16" className="h-3 w-3 text-colony-deep" aria-hidden>
        {online ? (
          <circle cx="8" cy="8" r="5" fill="currentColor" />
        ) : (
          <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
        )}
      </svg>
      {text}
    </span>
  );
}
