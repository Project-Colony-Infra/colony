// Server side client for the Coordinator REST API. Only route handlers use this,
// so the Coordinator address is never exposed to the browser.

const BASE = process.env.COORDINATOR_API_URL || "http://localhost:8081";

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
}

export async function getJSON(path: string): Promise<unknown> {
  const res = await request(path);
  if (!res.ok) throw new Error(`coordinator ${path} returned ${res.status}`);
  return res.json();
}

export async function postJSON(path: string, body: unknown): Promise<Response> {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}

export async function del(path: string): Promise<Response> {
  return request(path, { method: "DELETE" });
}
