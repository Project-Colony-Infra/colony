import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getJSON } from "@/lib/coordinator";

export async function GET(req: Request) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = new URL(req.url).searchParams.get("limit") || "100";
  try {
    return NextResponse.json(await getJSON(`/api/v1/errors?limit=${encodeURIComponent(limit)}`));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
