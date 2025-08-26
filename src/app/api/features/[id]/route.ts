import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { isRequesterAdmin, getUserIdByEmail } from "@/lib/utils/admin";

const ALLOWED = ["under_review", "planned", "in_progress", "done"] as const;
type FeatureStatus = (typeof ALLOWED)[number];

function toSlug(input: string): FeatureStatus | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "_");
  return (ALLOWED as readonly string[]).includes(s) ? (s as FeatureStatus) : null;
}

// GET /api/features/[id]?email=&name=&includeComments=true
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || "";
  const name = searchParams.get("name") || "";
  const includeComments = searchParams.get("includeComments") === "true";

  if (!email || !name) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  try {
    if (includeComments) {
      // Get feature data first
      const { data: feature, error: featureError } = await supabaseAdmin.from("features_public").select("*").eq("id", id).single();

      if (featureError) {
        if (featureError.code === "PGRST116") {
          return NextResponse.json({ error: "Feature not found" }, { status: 404 });
        }
        console.error("Error fetching feature:", featureError);
        return NextResponse.json({ error: featureError.message }, { status: 500 });
      }

      if (!feature) {
        return NextResponse.json({ error: "Feature not found" }, { status: 404 });
      }

      // Check if user has voted for this feature
      let votedByMe = false;
      const userId = await getUserIdByEmail(email);
      if (userId) {
        const { data: vote } = await supabaseAdmin.from("votes").select("id").eq("user_id", userId).eq("feature_id", id).single();
        votedByMe = !!vote;
      }

      // Get comments with replies using the same function as ActivityFeed
      const { data: commentsResult, error: commentsError } = await supabaseAdmin.rpc("get_comments_with_replies", {
        p_email: email.toLowerCase().trim(),
        p_feature_id: id,
        p_sort: "newest",
        p_limit: 10,
        p_offset: 0,
        p_replies_limit: 3, // Load first 3 replies initially
      });

      if (commentsError) {
        console.error("Error fetching comments with replies:", commentsError);
        return NextResponse.json({ error: commentsError.message }, { status: 500 });
      }

      const comments = Array.isArray(commentsResult) ? commentsResult : [];

      // Get total count of top-level comments for pagination
      const { count: totalCount } = await supabaseAdmin
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("feature_id", id)
        .is("parent_id", null)
        .eq("is_deleted", false);

      const total = totalCount || 0;
      const hasMore = total > 10; // We loaded 10 comments, check if there are more than 10 total

      return NextResponse.json({
        ...feature,
        votedByMe,
        comments,
        commentsTotal: total,
        commentsHasMore: hasMore,
      });
    } else {
      // Fallback to original logic for backward compatibility
      const { data: feature, error } = await supabaseAdmin.from("features_public").select("*").eq("id", id).single();

      if (error) {
        if (error.code === "PGRST116") {
          return NextResponse.json({ error: "Feature not found" }, { status: 404 });
        }
        console.error("Error fetching feature:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!feature) {
        return NextResponse.json({ error: "Feature not found" }, { status: 404 });
      }

      // Check if user has voted for this feature
      let votedByMe = false;
      const userId = await getUserIdByEmail(email);
      if (userId) {
        const { data: vote } = await supabaseAdmin.from("votes").select("id").eq("user_id", userId).eq("feature_id", id).single();
        votedByMe = !!vote;
      }

      return NextResponse.json({
        ...feature,
        votedByMe,
      });
    }
  } catch (error) {
    console.error("Error in GET /api/features/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Verify admin authentication using JWT
  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
  };

  const status = body.status ? toSlug(body.status) : null;
  if (!status) {
    return NextResponse.json(
      {
        error: "Invalid status. Use: under_review | planned | in_progress | done",
      },
      { status: 400 }
    );
  }

  // Update feature status directly using admin privileges
  const { data, error } = await supabaseAdmin
    .from("features")
    .update({ status_id: getStatusId(status) })
    .eq("id", id)
    .select("*, users!inner(name, email, image_url)")
    .single();

  if (error) {
    console.error("Error updating feature status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Feature not found" }, { status: 404 });

  return NextResponse.json({ item: data });
}

// Helper to get status ID from slug
function getStatusId(slug: string): number {
  const statusMap: Record<string, number> = {
    under_review: 1,
    planned: 2,
    in_progress: 3,
    done: 4,
  };
  return statusMap[slug] || 1;
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Verify admin authentication using JWT
  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Delete feature directly using admin privileges
  const { error } = await supabaseAdmin.from("features").delete().eq("id", id);

  if (error) {
    console.error("Error deleting feature:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
