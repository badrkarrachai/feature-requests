import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/features/[id]/comments/[comment_id]/replies - Load more replies for a specific comment
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; comment_id: string }> }) {
  const { id, comment_id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || "";
  const name = searchParams.get("name") || "";
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 50);

  if (!email || !name) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  try {
    // Validate comment belongs to this feature
    const { data: comment } = await supabaseAdmin.from("comments").select("feature_id").eq("id", comment_id).eq("is_deleted", false).single();

    if (!comment || comment.feature_id !== id) {
      return NextResponse.json({ error: "Comment not found or doesn't belong to this feature" }, { status: 404 });
    }

    // Get more replies using the new RPC function
    const { data: rpcResult, error } = await supabaseAdmin.rpc("get_comment_replies", {
      p_email: email.toLowerCase().trim(),
      p_comment_id: comment_id,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error("Error getting more replies:", error);
      return NextResponse.json({ error: "Failed to load more replies" }, { status: 500 });
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

    return NextResponse.json({
      replies: result?.replies || [],
      has_more: result?.has_more || false,
      total_count: result?.total_count || 0,
    });
  } catch (error) {
    console.error("Error in GET /api/features/[id]/comments/[comment_id]/replies:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
