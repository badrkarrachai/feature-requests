import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export const runtime = "nodejs";

// POST /api/features/[id]/comments/[comment_id]/like - Toggle comment like
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; comment_id: string }> }) {
  const { id: featureId, comment_id: commentId } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const { email, name, image_url } = body as {
      email?: string;
      name?: string;
      image_url?: string;
    };

    // Validate required fields
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    // Use the toggle_comment_like RPC function
    const { data: action, error } = await supabaseAdmin.rpc("toggle_comment_like", {
      p_email: email.toLowerCase().trim(),
      p_name: name.trim(),
      p_image_url: image_url || null,
      p_comment_id: commentId,
    });

    if (error) {
      console.error("Error toggling comment like:", error);

      // Handle specific error cases
      if (error.message.includes("comment not found")) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get the updated comment to return the current like count
    const { data: comment } = await supabaseAdmin.from("comments_public").select("likes_count").eq("id", commentId).single();

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    return NextResponse.json({
      liked: action === "added",
      likes_count: comment.likes_count,
      action,
    });
  } catch (error) {
    console.error("Error in POST /api/features/[id]/comments/[comment_id]/like:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
