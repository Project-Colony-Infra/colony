import type { ReactNode } from "react";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-colony-mist bg-colony-nearwhite p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-colony-slate">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ONLINE: "bg-colony-ice text-colony-midnight",
    BUSY: "bg-colony-softblue text-colony-deep",
    OFFLINE: "bg-colony-mist text-colony-navy",
  };
  const cls = map[status] ?? "bg-colony-mist text-colony-navy";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "ONLINE" ? "bg-colony-deep" : "bg-colony-slate"}`} />
      {label(status)}
    </span>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    INFO: "bg-colony-softblue text-colony-deep",
    WARN: "bg-colony-warmbeige text-colony-navy",
    ERROR: "bg-colony-indigo text-colony-cloud",
  };
  const cls = map[level] ?? "bg-colony-mist text-colony-navy";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{level}</span>;
}

export function CategoryChip({ category }: { category: string }) {
  return (
    <span className="rounded border border-colony-mist bg-colony-lightblue px-1.5 py-0.5 text-xs font-medium text-colony-slate">
      {category}
    </span>
  );
}

// Swatch pairs a palette color square with a label for use in bar legends.
export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-colony-slate">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function label(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-colony-mist bg-colony-nearwhite p-5">
      <div className="text-xs uppercase tracking-wide text-colony-slate">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-colony-navy">{value}</div>
      {hint && <div className="mt-1 text-xs text-colony-slate">{hint}</div>}
    </div>
  );
}

export function Banner({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-colony-mist bg-colony-paleblue px-4 py-3 text-sm text-colony-midnight">
      {text}
    </div>
  );
}
