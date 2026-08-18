import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getJSON, postJSON } from "@/lib/coordinator";

export async function GET(req: Request) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = new URL(req.url).searchParams.get("limit") || "100";
  try {
    return NextResponse.json(await getJSON(`/api/v1/feedback?limit=${encodeURIComponent(limit)}`));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  try {
    const res = await postJSON("/api/v1/feedback", body);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
