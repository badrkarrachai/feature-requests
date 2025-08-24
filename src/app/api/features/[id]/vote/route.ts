import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { email, name, image_url } = body as {
    email?: string;
    name?: string;
    image_url?: string;
  };

  if (!email)
    return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!name)
    return NextResponse.json({ error: "name required" }, { status: 400 });

  // Use the toggle_vote RPC function which handles user creation and vote toggling
  const { data: action, error } = await supabaseAdmin.rpc("toggle_vote", {
    p_email: email.toLowerCase(),
    p_name: name.trim().toLowerCase(),
    p_image_url: image_url || null,
    p_feature_id: id,
  });

  if (error) {
    console.error("Error toggling vote:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get the updated feature to return the current vote count
  const { data: feature } = await supabaseAdmin
    .from("features")
    .select("votes_count")
    .eq("id", id)
    .single();

  if (!feature) {
    return NextResponse.json({ error: "Feature not found" }, { status: 404 });
  }

  return NextResponse.json({
    voted: action === "added",
    votes_count: feature.votes_count,
  });
}
