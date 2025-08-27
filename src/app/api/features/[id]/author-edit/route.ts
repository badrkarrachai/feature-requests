import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { getUserIdByEmail } from "@/lib/utils/admin";

export const runtime = "nodejs";

// PATCH /api/features/[id]/author-edit - Allow feature author to edit their own feature
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: featureId } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const { email, name, title, description } = body as {
      email?: string;
      name?: string;
      title?: string;
      description?: string;
    };

    // Validate required fields
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: "description required" }, { status: 400 });
    }

    // Validate content length
    if (title.length > 200) {
      return NextResponse.json({ error: "title must be 200 characters or less" }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: "description must be 2000 characters or less" }, { status: 400 });
    }

    // Get the user ID
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the feature - only allow the author to edit their own feature
    const { data: feature, error } = await supabaseAdmin
      .from("features")
      .update({
        title: title.trim(),
        description: description.trim(),
      })
      .eq("id", featureId)
      .eq("user_id", userId) // Ensure only author can edit
      .select(
        `
        *,
        users!inner(name, email, image_url)
      `
      )
      .single();

    if (error) {
      console.error("Error updating feature:", error);

      if (error.code === "PGRST116") {
        return NextResponse.json(
          {
            error: "Feature not found or you don't have permission to edit it",
          },
          { status: 404 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get the updated feature with additional data from features_public view
    const { data: fullFeature } = await supabaseAdmin.from("features_public").select("*").eq("id", featureId).single();

    return NextResponse.json({
      feature: fullFeature || feature,
      success: true,
    });
  } catch (error) {
    console.error("Error in PATCH /api/features/[id]/author-edit:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
