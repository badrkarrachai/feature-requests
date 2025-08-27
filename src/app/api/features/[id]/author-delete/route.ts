import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { getUserIdByEmail } from "@/lib/utils/admin";

export const runtime = "nodejs";

// DELETE /api/features/[id]/author-delete - Allow feature author to delete their own feature
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const { email, name } = body as {
      email?: string;
      name?: string;
    };

    // Validate required fields
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    // Get the user ID
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if the feature exists and belongs to the user
    const { data: existingFeature, error: checkError } = await supabaseAdmin
      .from("features")
      .select("id, user_id")
      .eq("id", featureId)
      .eq("user_id", userId)
      .single();

    if (checkError) {
      if (checkError.code === "PGRST116") {
        return NextResponse.json(
          {
            error: "Feature not found or you don't have permission to delete it",
          },
          { status: 404 }
        );
      }
      console.error("Error checking feature ownership:", checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    // Delete the feature - this will cascade delete comments due to foreign key constraints
    const { error } = await supabaseAdmin.from("features").delete().eq("id", featureId).eq("user_id", userId); // Double-check ownership

    if (error) {
      console.error("Error deleting feature:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Feature deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /api/features/[id]/author-delete:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
