import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // <-- Promise here too
) {
  const { id } = await ctx.params; // <-- await it

  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const status = body.status as "open" | "planned" | "in_progress" | "done" | undefined;
  if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("features").update({ status }).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
