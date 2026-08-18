"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Invalid credentials");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-colony-navy px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-md border border-colony-deep bg-colony-nearwhite p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-colony-core" />
          <div>
            <div className="text-lg font-semibold text-colony-navy">Zonn Console</div>
            <div className="text-xs text-colony-slate">Admin control plane</div>
          </div>
        </div>
        <label className="mb-1 block text-sm text-colony-slate">Username</label>
        <input
          className="mb-4 w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <label className="mb-1 block text-sm text-colony-slate">Password</label>
        <input
          type="password"
          className="mb-4 w-full rounded border border-colony-softblue bg-colony-lightblue px-3 py-2 text-sm outline-none focus:border-colony-ice"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="mb-3 text-sm text-colony-indigo">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-colony-core px-4 py-2 text-sm font-medium text-colony-cloud hover:bg-colony-deep disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
