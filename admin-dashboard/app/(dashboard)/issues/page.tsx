"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/client";
import { Card, LevelBadge, Banner } from "@/components/ui";
import type { Node, NodeError } from "@/lib/types";

export default function IssuesPage() {
  const { data: errors, error } = usePoll<NodeError[]>("/api/errors?limit=200", 3000);
  const { data: nodes } = usePoll<Node[]>("/api/nodes", 5000);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (nodes ?? []).forEach((n) => m.set(n.id, n.name));
    return m;
  }, [nodes]);

  const rows = (errors ?? []).filter((e) => (onlyErrors ? e.level === "ERROR" || e.level === "WARN" : true));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-colony-navy">Issues</h1>
        <label className="flex items-center gap-2 text-sm text-colony-slate">
          <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
          Warnings and errors only
        </label>
      </div>

      {error && <Banner text={`Cannot reach the Coordinator: ${error}`} />}

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-colony-slate">No issues reported.</p>
        ) : (
          <div className="space-y-1 text-sm">
            {rows.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border-b border-colony-mist py-2 last:border-0">
                <span className="w-20 shrink-0 font-mono text-xs text-colony-slate">{new Date(e.ts).toLocaleTimeString()}</span>
                <LevelBadge level={e.level} />
                <span className="w-32 shrink-0 truncate text-xs text-colony-slate">{nameById.get(e.node_id) ?? e.node_id.slice(0, 10)}</span>
                <span className="text-colony-charcoal">{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
