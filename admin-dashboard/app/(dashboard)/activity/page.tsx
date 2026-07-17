"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/client";
import { Card, LevelBadge, CategoryChip, Banner } from "@/components/ui";
import type { Event } from "@/lib/types";

const LEVELS = ["ALL", "INFO", "WARN", "ERROR"] as const;
const CATEGORIES = ["ALL", "node", "colony", "job", "system"] as const;

type Level = (typeof LEVELS)[number];
type Category = (typeof CATEGORIES)[number];

export default function ActivityPage() {
  const { data: events, error } = usePoll<Event[]>("/api/activity", 3000);
  const [level, setLevel] = useState<Level>("ALL");
  const [category, setCategory] = useState<Category>("ALL");

  const rows = useMemo(() => {
    return (events ?? []).filter((e) => {
      if (level !== "ALL" && e.level !== level) return false;
      if (category !== "ALL" && e.category !== category) return false;
      return true;
    });
  }, [events, level, category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-colony-navy">Activity</h1>
        <div className="flex flex-wrap items-center gap-4">
          <Filter label="Level" value={level} options={LEVELS} onChange={(v) => setLevel(v as Level)} />
          <Filter label="Category" value={category} options={CATEGORIES} onChange={(v) => setCategory(v as Category)} />
        </div>
      </div>

      {error && <Banner text={`Cannot reach the Coordinator: ${error}`} />}

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-colony-slate">No activity recorded.</p>
        ) : (
          <div className="space-y-1 text-sm">
            {rows.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border-b border-colony-mist py-2 last:border-0">
                <span className="w-20 shrink-0 font-mono text-xs text-colony-slate">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span className="w-14 shrink-0">
                  <LevelBadge level={e.level} />
                </span>
                <span className="w-16 shrink-0">
                  <CategoryChip category={e.category} />
                </span>
                <span className="w-32 shrink-0 truncate text-xs text-colony-slate">
                  {e.node_name || e.node_id.slice(0, 10) || "system"}
                </span>
                <span className="text-colony-charcoal">{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-colony-slate">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-colony-softblue bg-colony-lightblue px-2 py-1 text-sm text-colony-navy outline-none focus:border-colony-ice"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
