"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, usePoll } from "@/lib/client";
import { Card, StatusBadge, Banner } from "@/components/ui";
import type { Colony, Job, Node } from "@/lib/types";

export default function ColoniesPage() {
  const { data: colonies, error } = usePoll<Colony[]>("/api/colonies", 3000);
  const { data: nodes } = usePoll<Node[]>("/api/nodes", 3000);
  const [showCreate, setShowCreate] = useState(false);
  const [deployFor, setDeployFor] = useState<Colony | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (nodes ?? []).forEach((n) => m.set(n.id, n.name));
    return m;
  }, [nodes]);

  const remove = async (id: string) => {
    try {
      await api(`/api/colonies/${id}`, { method: "DELETE" });
    } catch {
      // The poll will reflect the real state on the next tick.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-colony-navy">Colonies</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-colony-core px-4 py-2 text-sm font-medium text-colony-cloud hover:bg-colony-deep"
        >
          Create colony
        </button>
      </div>

      {error && <Banner text={`Cannot reach the Coordinator: ${error}`} />}

      {!colonies || colonies.length === 0 ? (
        <Card>
          <p className="text-sm text-colony-slate">No colonies yet. Create one to group nodes into a supercomputer.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {colonies.map((c) => (
            <Card
              key={c.id}
              title={c.name}
              action={
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeployFor(c)}
                    className="rounded bg-colony-core px-2 py-1 text-xs font-medium text-colony-cloud hover:bg-colony-deep"
                  >
                    Deploy LLM
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="rounded border border-colony-indigo px-2 py-1 text-xs text-colony-indigo hover:bg-colony-indigo hover:text-colony-cloud"
                  >
                    Delete
                  </button>
                </div>
              }
            >
              <p className="mb-2 font-mono text-xs text-colony-slate">{c.id}</p>
              <p className="mb-2 text-sm text-colony-slate">{c.node_ids.length} node(s)</p>
              <div className="flex flex-wrap gap-1.5">
                {c.node_ids.map((id) => (
                  <span key={id} className="rounded bg-colony-softblue px-2 py-0.5 text-xs text-colony-deep">
                    {nameById.get(id) ?? id.slice(0, 8)}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateColonyModal
          nodes={(nodes ?? []).filter((n) => n.status !== "OFFLINE")}
          onClose={() => setShowCreate(false)}
        />
      )}

      {deployFor && <DeployLLMModal colony={deployFor} onClose={() => setDeployFor(null)} />}
    </div>
  );
}

function DeployLLMModal({ colony, onClose }: { colony: Colony; onClose: () => void }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [engine, setEngine] = useState("mock");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const deploy = async () => {
    if (!prompt.trim()) {
      setErr("Enter a prompt.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const job = await api<Job>(`/api/colonies/${colony.id}/deploy-llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), engine }),
      });
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not deploy the job");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-colony-navy/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-colony-mist bg-colony-nearwhite p-6">
        <h2 className="mb-1 text-lg font-semibold text-colony-navy">Deploy LLM to {colony.name}</h2>
        <p className="mb-4 text-xs text-colony-slate">
          The model splits across two nodes in this colony. The primary runs the lower layers and relays activation tensors through the Coordinator to the secondary.
        </p>
        <label className="mb-1 block text-sm text-colony-slate">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Write a haiku about the ocean"
          className="mb-4 w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
        />
        <label className="mb-1 block text-sm text-colony-slate">Engine</label>
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
          className="mb-4 w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
        >
          <option value="mock">mock (no download, proves the relay)</option>
          <option value="real">real (needs a model on the nodes)</option>
        </select>
        {err && <p className="mb-3 text-sm text-colony-indigo">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-colony-mist px-4 py-2 text-sm text-colony-slate hover:text-colony-charcoal">
            Cancel
          </button>
          <button
            onClick={deploy}
            disabled={busy}
            className="rounded bg-colony-core px-4 py-2 text-sm font-medium text-colony-cloud hover:bg-colony-deep disabled:opacity-60"
          >
            {busy ? "Deploying..." : "Deploy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateColonyModal({ nodes, onClose }: { nodes: Node[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (!name.trim() || selected.size === 0) {
      setErr("Give the colony a name and pick at least one node.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await api("/api/colonies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), node_ids: Array.from(selected) }),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the colony");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-colony-navy/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-colony-mist bg-colony-nearwhite p-6">
        <h2 className="mb-4 text-lg font-semibold text-colony-navy">Create colony</h2>
        <label className="mb-1 block text-sm text-colony-slate">Colony name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="LLM-Test-1"
          className="mb-4 w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
        />
        <label className="mb-1 block text-sm text-colony-slate">Nodes ({selected.size} selected)</label>
        <div className="mb-4 max-h-64 overflow-y-auto rounded border border-colony-mist">
          {nodes.length === 0 && <p className="p-3 text-sm text-colony-slate">No online nodes to add.</p>}
          {nodes.map((n) => (
            <label key={n.id} className="flex cursor-pointer items-center gap-3 border-b border-colony-mist px-3 py-2 last:border-0 hover:bg-colony-lightblue">
              <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
              <span className="flex-1 text-sm text-colony-charcoal">{n.name}</span>
              <span className="text-xs text-colony-slate">{n.resources.gpu_model || n.os}</span>
              <StatusBadge status={n.status} />
            </label>
          ))}
        </div>
        {err && <p className="mb-3 text-sm text-colony-indigo">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-colony-mist px-4 py-2 text-sm text-colony-slate hover:text-colony-charcoal">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={busy}
            className="rounded bg-colony-core px-4 py-2 text-sm font-medium text-colony-cloud hover:bg-colony-deep disabled:opacity-60"
          >
            {busy ? "Creating..." : "Deploy colony"}
          </button>
        </div>
      </div>
    </div>
  );
}
