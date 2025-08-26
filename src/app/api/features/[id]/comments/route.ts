import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/features/[id]/comments?email=&name=&sort=newest|oldest&limit=10&page=1
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || "";
  const name = searchParams.get("name") || "";
  const sort = searchParams.get("sort") || "newest";

  // Pagination parameters
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 50);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  if (!email || !name) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  try {
    // Verify feature exists
    const { data: feature } = await supabaseAdmin.from("features").select("id").eq("id", id).single();

    if (!feature) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    // Use enhanced RPC function with database-level pagination
    let comments = [];
    let total = 0;

    try {
      const { data: rpcComments, error } = await supabaseAdmin.rpc("get_comments_with_user_likes", {
        p_email: email.toLowerCase().trim(),
        p_feature_id: id,
        p_sort: sort,
        p_limit: limit,
        p_offset: from,
      });

      if (error) {
        console.error("Error with enhanced RPC function:", error);
        throw error;
      }

      const results = rpcComments || [];

      // Extract total count from first result (all rows have same total_count)
      total = results.length > 0 ? results[0].total_count : 0;

      // Remove total_count from each comment object since it's metadata
      comments = results.map(({ total_count, ...comment }: { total_count: number; [key: string]: unknown }) => comment);
    } catch (rpcError) {
      console.error("RPC function failed:", rpcError);
      return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
    }

    const hasMore = from + comments.length < total;

    return NextResponse.json({
      comments,
      sort,
      page,
      total,
      pageSize: limit,
      hasMore,
    });
  } catch (error) {
    console.error("Error in GET /api/features/[id]/comments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/features/[id]/comments - Add comment (with optional reply support)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const { email, name, content, parent_comment_id, image_url } = body as {
      email?: string;
      name?: string;
      content?: string;
      parent_comment_id?: string | null;
      image_url?: string;
    };

    // Validate required fields
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!content || !content.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    // Validate content length
    if (content.length > 500) {
      return NextResponse.json({ error: "content must be 500 characters or less" }, { status: 400 });
    }

    // Use the enhanced add_comment RPC function with reply support
    const { data: comment, error } = await supabaseAdmin.rpc("add_comment", {
      p_email: email.toLowerCase().trim(),
      p_name: name.trim(),
      p_image_url: image_url || null,
      p_feature_id: id,
      p_content: content.trim(),
      p_parent_comment_id: parent_comment_id || null,
    });

    if (error) {
      console.error("Error adding comment:", error);

      // Handle specific error cases
      if (error.message.includes("feature not found")) {
        return NextResponse.json({ error: "Feature not found" }, { status: 404 });
      }
      if (error.message.includes("parent comment not found")) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
      if (error.message.includes("only one level of replies")) {
        return NextResponse.json({ error: "Only one level of replies is allowed" }, { status: 400 });
      }
      if (error.message.includes("different feature")) {
        return NextResponse.json({ error: "Parent comment belongs to a different feature" }, { status: 400 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!comment) {
      return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }

    // Get the full comment with author info from comments_public view
    const { data: fullComment } = await supabaseAdmin.from("comments_public").select("*").eq("id", comment.id).single();

    return NextResponse.json({
      comment: fullComment || comment,
      success: true,
    });
  } catch (error) {
    console.error("Error in POST /api/features/[id]/comments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
