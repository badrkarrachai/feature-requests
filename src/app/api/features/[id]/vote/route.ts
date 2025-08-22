import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { email } = body as { email?: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin.from("votes").select("id").eq("feature_id", id).eq("email", email).maybeSingle();

  if (existing) {
    await supabaseAdmin.from("votes").delete().eq("id", existing.id);
  } else {
    const { error } = await supabaseAdmin.from("votes").insert({ feature_id: id, email });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: feature } = await supabaseAdmin.from("features").select("votes_count").eq("id", id).single();

  return NextResponse.json({
    voted: !existing,
    votes_count: feature?.votes_count ?? null,
  });
}
