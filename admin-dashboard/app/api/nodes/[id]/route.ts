import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getJSON } from "@/lib/coordinator";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getJSON(`/api/v1/nodes/${params.id}`));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
