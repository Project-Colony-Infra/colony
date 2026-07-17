import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { del } from "@/lib/coordinator";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const res = await del(`/api/v1/colonies/${params.id}`);
    if (!res.ok && res.status !== 204) {
      return NextResponse.json({ error: `coordinator returned ${res.status}` }, { status: res.status });
    }
    return NextResponse.json({ status: "deleted" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
