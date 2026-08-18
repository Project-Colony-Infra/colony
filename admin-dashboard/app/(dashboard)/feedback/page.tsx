"use client";

import { useState } from "react";
import { api, usePoll } from "@/lib/client";
import { Card, Banner } from "@/components/ui";
import type { Feedback } from "@/lib/types";

export default function FeedbackPage() {
  const { data: items, error } = usePoll<Feedback[]>("/api/feedback?limit=100", 5000);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim()) {
      setErr("Say what happened or what you think should change.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await api("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), email: email.trim() }),
      });
      setMessage("");
      setEmail("");
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send that. Is the Coordinator running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-colony-navy">Feedback</h1>

      {error && <Banner text={`Cannot reach the Coordinator: ${error}`} />}

      <Card title="Send feedback">
        <p className="mb-3 text-sm text-colony-slate">
          Found a bug in the beta, or something that should work differently? Tell us here. The email is optional,
          leave it blank to stay anonymous.
        </p>
        <label className="mb-1 block text-sm text-colony-slate">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="What happened, and what did you expect instead?"
          className="mb-4 w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
        />
        <label className="mb-1 block text-sm text-colony-slate">Email (optional)</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mb-4 w-full max-w-sm rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
        />
        {err && <p className="mb-3 text-sm text-colony-indigo">{err}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={busy}
            className="rounded bg-colony-core px-4 py-2 text-sm font-medium text-colony-cloud hover:bg-colony-deep disabled:opacity-60"
          >
            {busy ? "Sending..." : "Send feedback"}
          </button>
          {sent && <span className="text-sm text-colony-slate">Sent, thank you.</span>}
        </div>
      </Card>

      <Card title="Recent submissions">
        {!items || items.length === 0 ? (
          <p className="text-sm text-colony-slate">No feedback submitted yet.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {items.map((f) => (
              <div key={f.id} className="border-b border-colony-mist pb-3 last:border-0">
                <div className="mb-1 flex items-center gap-3 text-xs text-colony-slate">
                  <span>{new Date(f.ts).toLocaleString()}</span>
                  {f.email && <span className="font-mono">{f.email}</span>}
                </div>
                <p className="whitespace-pre-wrap text-colony-charcoal">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
