import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { getUserIdByEmail } from "@/lib/utils/admin";

export const runtime = "nodejs";

// DELETE /api/features/[id]/comments/[comment_id] - Soft delete comment by owner
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; comment_id: string }> }) {
  const { id: featureId, comment_id: commentId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || "";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  try {
    // Use the soft_delete_comment_by_owner RPC function
    const { data: success, error } = await supabaseAdmin.rpc("soft_delete_comment_by_owner", {
      p_email: email.toLowerCase().trim(),
      p_comment_id: commentId,
    });

    if (error) {
      console.error("Error soft deleting comment:", error);

      // Handle specific error cases
      if (error.message.includes("user not found")) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!success) {
      return NextResponse.json(
        {
          error: "Comment not found or you don't have permission to delete it",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /api/features/[id]/comments/[comment_id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/features/[id]/comments/[comment_id] - Edit comment (for future use)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; comment_id: string }> }) {
  const { id: featureId, comment_id: commentId } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const { email, content } = body as {
      email?: string;
      content?: string;
    };

    // Validate required fields
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!content || !content.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    // Validate content length
    if (content.length > 500) {
      return NextResponse.json({ error: "content must be 500 characters or less" }, { status: 400 });
    }

    // Get the user ID first to ensure proper ownership validation
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the comment
    const { data: comment, error } = await supabaseAdmin
      .from("comments")
      .update({
        content: content.trim(),
        edited_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .eq("user_id", userId) // Ensure only owner can edit
      .eq("is_deleted", false) // Can't edit deleted comments
      .select("*")
      .single();

    if (error) {
      console.error("Error editing comment:", error);

      if (error.code === "PGRST116") {
        return NextResponse.json(
          {
            error: "Comment not found or you don't have permission to edit it",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get the updated comment with author info from comments_public view
    const { data: fullComment } = await supabaseAdmin.from("comments_public").select("*").eq("id", commentId).single();

    return NextResponse.json({
      comment: fullComment || comment,
      success: true,
    });
  } catch (error) {
    console.error("Error in PATCH /api/features/[id]/comments/[comment_id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
