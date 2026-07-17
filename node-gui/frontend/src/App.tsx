import { useEffect, useState } from "react";
import { RadialBar, RadialBarChart, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { fetchState, fetchConfig, saveConfig } from "./api";
import type { Allocation, Config, State } from "./types";

type Tab = "overview" | "analytics" | "resources" | "activity";

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [reachable, setReachable] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await fetchState();
        if (active) {
          setState(s);
          setReachable(true);
        }
      } catch {
        if (active) setReachable(false);
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-screen bg-colony-cloud text-colony-charcoal">
      <Header state={state} reachable={reachable} />
      <Tabs tab={tab} setTab={setTab} />
      <main className="mx-auto max-w-5xl px-6 py-6">
        {!reachable && <Banner text="Cannot reach the local node service on port 9090. Is the node running?" />}
        {reachable && !state && <Banner text="Starting up..." />}
        {state && tab === "overview" && <Overview state={state} />}
        {state && tab === "analytics" && <Analytics state={state} />}
        {state && tab === "resources" && <Resources state={state} />}
        {state && tab === "activity" && <Activity state={state} />}
      </main>
    </div>
  );
}

function Header({ state, reachable }: { state: State | null; reachable: boolean }) {
  const online = reachable && state?.status === "ONLINE";
  return (
    <header className="bg-colony-navy px-6 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-colony-core" />
          <div>
            <div className="text-lg font-semibold text-colony-cloud">Project Colony</div>
            <div className="text-xs text-colony-ice">One Colony, Infinite Compute</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium text-colony-cloud">{state?.node_name ?? "..."}</div>
            <div className="font-mono text-xs text-colony-mist">{state?.coordinator_url ?? ""}</div>
          </div>
          <StatusPill online={online} connection={state?.connection ?? "DISCONNECTED"} />
        </div>
      </div>
    </header>
  );
}

function StatusPill({ online, connection }: { online: boolean; connection: string }) {
  const label = online ? "Online" : connection === "CONNECTING" ? "Connecting" : "Offline";
  const cls = online ? "bg-colony-ice text-colony-midnight" : "bg-colony-mist text-colony-navy";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${online ? "bg-colony-deep" : "bg-colony-slate"}`} />
      {label}
    </span>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "analytics", label: "Analytics" },
    { key: "resources", label: "Resources" },
    { key: "activity", label: "Activity" },
  ];
  return (
    <nav className="border-b border-colony-mist bg-colony-nearwhite px-6">
      <div className="mx-auto flex max-w-5xl gap-1">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              tab === it.key
                ? "border-colony-core text-colony-core"
                : "border-transparent text-colony-slate hover:text-colony-charcoal"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Overview({ state }: { state: State }) {
  const u = state.utilization;
  const a = state.allocation;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Node">
        <Row label="Name" value={state.node_name} />
        <Row label="Identity" value={state.node_id} mono />
        <Row label="Connection" value={state.connection} />
        <Row label="Colony" value={state.colony_id || "Not in a colony"} mono={!!state.colony_id} />
      </Card>
      <Card title="Machine">
        <Row label="System" value={state.specs.os} />
        <Row label="CPU" value={`${state.specs.cpu_cores} cores`} />
        <Row label="Memory" value={`${state.specs.ram_gb} GB`} />
        <Row label="GPU" value={state.specs.gpu_model || "None detected"} />
      </Card>
      <Card title="Live usage">
        <Meter label="CPU" used={u.cpu_used} total={a.cpu_cores || state.specs.cpu_cores} unit="cores" />
        <Meter label="Memory" used={u.ram_used_gb} total={a.ram_gb || state.specs.ram_gb} unit="GB" />
        {state.specs.gpu_memory_gb > 0 && (
          <Meter label="GPU memory" used={u.gpu_mem_used_gb} total={a.gpu_memory_gb || state.specs.gpu_memory_gb} unit="GB" />
        )}
      </Card>
      <Card title="Donated">
        <Row label="CPU cores" value={String(a.cpu_cores)} />
        <Row label="Memory" value={`${a.ram_gb} GB`} />
        <Row label="GPU memory" value={`${a.gpu_memory_gb} GB`} />
        <Row label="Bandwidth" value={`${a.bandwidth_mbps} Mbps`} />
      </Card>
    </div>
  );
}

function Analytics({ state }: { state: State }) {
  const r = state.ranking;
  const u = state.utilization;
  const a = state.allocation;
  const cpuTotal = a.cpu_cores || state.specs.cpu_cores;
  const ramTotal = a.ram_gb || state.specs.ram_gb;

  const vsAverage =
    r.average_score > 0 ? Math.round(((r.contribution_score - r.average_score) / r.average_score) * 100) : 0;
  const comparison =
    r.active_nodes <= 1
      ? "You are the only active node right now."
      : vsAverage === 0
        ? "Your contribution is right at the colony average."
        : vsAverage > 0
          ? `Your contribution is ${vsAverage}% above the colony average.`
          : `Your contribution is ${Math.abs(vsAverage)}% below the colony average.`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Your rank">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-colony-core">
              {r.rank > 0 ? `#${r.rank}` : "--"}
            </span>
            <span className="text-sm text-colony-slate">of {r.active_nodes} active nodes</span>
          </div>
          <p className="mt-2 text-sm text-colony-slate">{comparison}</p>
        </Card>
        <Card title="Contribution score">
          <div className="text-4xl font-semibold text-colony-deep">{r.contribution_score.toFixed(0)}</div>
          <p className="mt-2 text-sm text-colony-slate">Colony average {r.average_score.toFixed(0)}</p>
        </Card>
        <Card title="Standing">
          <ScoreBar score={r.contribution_score} average={r.average_score} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="CPU">
          <Gauge used={u.cpu_used} total={cpuTotal} unit="cores" />
        </Card>
        <Card title="Memory">
          <Gauge used={u.ram_used_gb} total={ramTotal} unit="GB" />
        </Card>
        {state.specs.gpu_memory_gb > 0 ? (
          <Card title="GPU memory">
            <Gauge used={u.gpu_mem_used_gb} total={a.gpu_memory_gb || state.specs.gpu_memory_gb} unit="GB" />
          </Card>
        ) : (
          <Card title="GPU">
            <p className="text-sm text-colony-slate">No GPU is being donated.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Gauge({ used, total, unit }: { used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const data = [{ name: unit, value: pct, fill: "#255DC0" }];
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={150}>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={data} startAngle={220} endAngle={-40}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "#C8CCD9" }} dataKey="value" cornerRadius={8} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-colony-charcoal">{pct}%</span>
        <span className="font-mono text-xs text-colony-slate">
          {used.toFixed(1)} / {total} {unit}
        </span>
      </div>
    </div>
  );
}

function ScoreBar({ score, average }: { score: number; average: number }) {
  const max = Math.max(score, average, 1);
  return (
    <div className="space-y-3 pt-2">
      <LabeledBar label="You" value={score} max={max} color="bg-colony-core" />
      <LabeledBar label="Average" value={average} max={max} color="bg-colony-grayblue" />
    </div>
  );
}

function LabeledBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between">
        <span className="text-colony-slate">{label}</span>
        <span className="font-mono text-xs text-colony-charcoal">{value.toFixed(0)}</span>
      </div>
      <div className="h-2 w-full rounded bg-colony-mist">
        <div className={`h-2 rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Resources({ state }: { state: State }) {
  const [alloc, setAlloc] = useState<Allocation>(state.allocation);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof Allocation, value: number) => {
    setAlloc((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const cfg: Config = await fetchConfig();
      cfg.allocation = alloc;
      await saveConfig(cfg);
      setSaved(true);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Detected hardware">
        <Row label="Operating system" value={state.specs.os} />
        <Row label="Architecture" value={state.specs.arch} />
        <Row label="CPU cores" value={String(state.specs.cpu_cores)} />
        <Row label="Memory" value={`${state.specs.ram_gb} GB`} />
        <Row label="Disk" value={`${state.specs.disk_gb} GB`} />
        <Row label="GPU" value={state.specs.gpu_model || "None detected"} />
        {state.specs.gpu_memory_gb > 0 && <Row label="GPU memory" value={`${state.specs.gpu_memory_gb} GB`} />}
      </Card>
      <Card title="What you donate">
        <Slider label="CPU cores" value={alloc.cpu_cores} max={state.specs.cpu_cores} unit="cores" onChange={(v) => set("cpu_cores", v)} />
        <Slider label="Memory" value={alloc.ram_gb} max={state.specs.ram_gb} unit="GB" onChange={(v) => set("ram_gb", v)} />
        <Slider label="GPU memory" value={alloc.gpu_memory_gb} max={state.specs.gpu_memory_gb} unit="GB" onChange={(v) => set("gpu_memory_gb", v)} />
        <Slider label="Bandwidth" value={alloc.bandwidth_mbps} max={1000} unit="Mbps" onChange={(v) => set("bandwidth_mbps", v)} />
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-colony-core px-4 py-2 text-sm font-medium text-colony-cloud hover:bg-colony-deep disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save allocation"}
          </button>
          {saved && <span className="text-sm text-colony-slate">Saved and applied.</span>}
        </div>
      </Card>
    </div>
  );
}

function Activity({ state }: { state: State }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = state.events.map((e) => `${e.time} ${e.level} ${e.message}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card
      title="Activity"
      action={
        <button onClick={copy} className="rounded border border-colony-mist px-2 py-1 text-xs text-colony-slate hover:text-colony-charcoal">
          {copied ? "Copied" : "Copy log"}
        </button>
      }
    >
      <div className="max-h-[28rem] overflow-y-auto font-mono text-xs">
        {state.events.length === 0 && <div className="text-colony-slate">No activity yet.</div>}
        {state.events.map((e, i) => (
          <div key={i} className="flex gap-3 border-b border-colony-mist py-1.5 last:border-0">
            <span className="shrink-0 text-colony-slate">{new Date(e.time).toLocaleTimeString()}</span>
            <LevelTag level={e.level} />
            <span className="text-colony-charcoal">{e.message}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LevelTag({ level }: { level: string }) {
  const map: Record<string, string> = {
    INFO: "bg-colony-softblue text-colony-deep",
    WARN: "bg-colony-warmbeige text-colony-navy",
    ERROR: "bg-colony-indigo text-colony-cloud",
  };
  const cls = map[level] ?? "bg-colony-mist text-colony-navy";
  return <span className={`shrink-0 rounded px-1.5 ${cls}`}>{level}</span>;
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-colony-mist bg-colony-nearwhite p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-colony-slate">{title}</h2>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-colony-slate">{label}</span>
      <span className={`text-right text-colony-charcoal ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function Meter({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between">
        <span className="text-colony-slate">{label}</span>
        <span className="font-mono text-xs text-colony-charcoal">
          {used.toFixed(1)} / {total} {unit}
        </span>
      </div>
      <div className="h-2 w-full rounded bg-colony-mist">
        <div className="h-2 rounded bg-colony-core" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const safeMax = Math.max(0, max);
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between">
        <span className="text-colony-slate">{label}</span>
        <span className="font-mono text-xs text-colony-charcoal">
          {value} / {safeMax} {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={safeMax}
        value={Math.min(value, safeMax)}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={safeMax === 0}
      />
    </div>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-colony-mist bg-colony-paleblue px-4 py-3 text-sm text-colony-midnight">
      {text}
    </div>
  );
}
