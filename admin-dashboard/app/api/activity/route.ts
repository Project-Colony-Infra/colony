import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getJSON } from "@/lib/coordinator";

export async function GET() {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getJSON("/api/v1/activity?limit=200"));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
