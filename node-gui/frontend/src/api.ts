import type { Config, State } from "./types";

// The local daemon serves live data on port 9090. Using an absolute base means
// the dashboard works both inside the Wails webview and in a plain browser.
const BASE = "http://localhost:9090";

export async function fetchState(): Promise<State> {
  const res = await fetch(`${BASE}/api/state`);
  if (!res.ok) throw new Error(`state request failed: ${res.status}`);
  return res.json();
}

export async function fetchConfig(): Promise<Config> {
  const res = await fetch(`${BASE}/api/config`);
  if (!res.ok) throw new Error(`config request failed: ${res.status}`);
  return res.json();
}

export async function saveConfig(cfg: Config): Promise<Config> {
  const res = await fetch(`${BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`config save failed: ${res.status}`);
  return res.json();
}
