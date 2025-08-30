import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { isRequesterAdmin, getUserIdByEmail, getAdminUser } from "@/lib/utils/admin";

const ALLOWED = ["under_review", "planned", "in_progress", "done"] as const;
type FeatureStatus = (typeof ALLOWED)[number];

function toSlug(input: string): FeatureStatus | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "_");
  return (ALLOWED as readonly string[]).includes(s) ? (s as FeatureStatus) : null;
}

// GET /api/features/[id]?app_slug=&email=&name=&url_image=&includeComments=true
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const appSlug = searchParams.get("app_slug") || "default"; // Use 'default' app per new schema
  const email = searchParams.get("email") || "";
  const name = searchParams.get("name") || "";
  const urlImage = searchParams.get("url_image") || null;
  const includeComments = searchParams.get("includeComments") === "true";

  if (!email || !name) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  // Ensure user exists/updates if email and name are provided
  try {
    await supabaseAdmin.rpc("ensure_user", {
      p_email: email.toLowerCase().trim(),
      p_name: name.trim().toLowerCase(),
      p_image_url: urlImage,
    });
  } catch (error) {
    console.error("Error ensuring user exists:", error);
    // Continue with the request even if user creation fails
  }

  // Check if requester is admin
  const isAdmin = await isRequesterAdmin();

  try {
    if (includeComments) {
      // Get feature data first (app-scoped)
      const { data: feature, error: featureError } = await supabaseAdmin
        .from("features_public")
        .select("*")
        .eq("id", id)
        .eq("app_slug", appSlug.toLowerCase().trim())
        .single();

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

      // Get comments using simple approach like the old working version
      const { data: mainComments, error: commentsError } = await supabaseAdmin.rpc("get_comments_with_user_likes", {
        p_app_slug: appSlug.toLowerCase().trim(),
        p_email: email.toLowerCase().trim(),
        p_feature_id: id,
        p_sort: "newest",
        p_limit: 10,
        p_offset: 0,
      });

      if (commentsError) {
        console.error("Error fetching comments:", commentsError);
        return NextResponse.json({ error: commentsError.message }, { status: 500 });
      }

      const mainCommentsArray = Array.isArray(mainComments) ? mainComments : [];

      // Get replies for each main comment (first 3 replies each)
      const comments = await Promise.all(
        mainCommentsArray.map(async (comment: any) => {
          const { data: replies } = await supabaseAdmin.rpc("get_comment_replies", {
            p_email: email.toLowerCase().trim(),
            p_comment_id: comment.id,
            p_limit: 3,
            p_offset: 0,
          });

          const repliesResult = Array.isArray(replies) ? replies[0] : replies;

          return {
            ...comment,
            replies: {
              items: repliesResult?.replies || [],
              has_more: repliesResult?.has_more || false,
              total_count: repliesResult?.total_count || 0,
            },
          };
        })
      );

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
        isAdmin,
      });
    } else {
      // Fallback to original logic for backward compatibility (app-scoped)
      const { data: feature, error } = await supabaseAdmin
        .from("features_public")
        .select("*")
        .eq("id", id)
        .eq("app_slug", appSlug.toLowerCase().trim())
        .single();

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
        isAdmin,
      });
    }
  } catch (error) {
    console.error("Error in GET /api/features/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const appSlug = searchParams.get("app_slug") || "default";

  // Verify admin authentication using JWT
  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    title?: string;
    description?: string;
    admin_email?: string;
    admin_password?: string;
    app_slug?: string;
  };

  // Use app_slug from body if provided, otherwise use from query params
  const finalAppSlug = body.app_slug || appSlug;

  // Get authenticated admin user
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
  }

  // Check if this is an edit request (has title/description) or status update
  const isEditRequest = body.title !== undefined || body.description !== undefined;

  if (isEditRequest) {
    // Handle full feature editing (title, description, and optionally status)
    const title = body.title?.trim();
    const description = body.description?.trim();
    const statusSlug = body.status ? toSlug(body.status) : null;

    if (!title && !description && !statusSlug) {
      return NextResponse.json(
        {
          error: "At least one field (title, description, or status) must be provided",
        },
        { status: 400 }
      );
    }

    // Use the admin_edit_feature RPC function
    const { data, error } = await supabaseAdmin.rpc("admin_edit_feature", {
      p_admin_id: adminUser.id,
      p_feature_id: id,
      p_title: title || null,
      p_description: description || null,
      p_status_slug: statusSlug,
    });

    if (error) {
      console.error("Error editing feature:", error);
      if (error.message.includes("invalid admin user")) {
        return NextResponse.json({ error: "Admin access denied" }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    return NextResponse.json({ feature: data });
  } else {
    // Handle status-only update
    const status = body.status ? toSlug(body.status) : null;
    if (!status) {
      return NextResponse.json(
        {
          error: "Invalid status. Use: under_review | planned | in_progress | done",
        },
        { status: 400 }
      );
    }

    // Use the admin_update_feature_status RPC function
    const { data, error } = await supabaseAdmin.rpc("admin_update_feature_status", {
      p_admin_id: adminUser.id,
      p_feature_id: id,
      p_new_status: status,
    });

    if (error) {
      console.error("Error updating feature status:", error);
      if (error.message.includes("invalid admin user")) {
        return NextResponse.json({ error: "Admin access denied" }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    return NextResponse.json({ item: data });
  }
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
  const { searchParams } = new URL(req.url);
  const appSlug = searchParams.get("app_slug") || "default";

  // Verify admin authentication using JWT
  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Get authenticated admin user
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
  }

  // Fetch author info before deletion for reliable notification fallback
  const { data: preFeature } = await supabaseAdmin
    .from("features")
    .select("id, user_id, app_id, title")
    .eq("id", id)
    .single();

  // Use the admin RPC function for feature deletion
  const { data, error } = await supabaseAdmin.rpc("admin_delete_feature", {
    p_admin_id: adminUser.id,
    p_feature_id: id,
  });

  if (error) {
    console.error("Error deleting feature:", error);
    if (error.message.includes("invalid admin user")) {
      return NextResponse.json({ error: "Admin access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Feature not found or already deleted" }, { status: 404 });
  }

  // Best-effort: ensure author is notified even if DB trigger didn't fire for some reason
  try {
    if (preFeature && preFeature.user_id) {
      // Check if a recent notification already exists to avoid duplicates
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", preFeature.user_id)
        .eq("type", "feature_deleted")
        .eq("app_id", preFeature.app_id)
        .gte("created_at", fiveMinAgo)
        .limit(1);

      if ((!existing || existing.length === 0) && preFeature.app_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: preFeature.user_id,
          app_id: preFeature.app_id,
          type: "feature_deleted",
          title: "Your feature request was removed",
          message: "Removed by an admin.",
          feature_id: null,
          feature_title_snapshot: preFeature.title,
          comment_id: null,
        });
      }
    }
  } catch (notifyErr) {
    console.warn("Feature delete: fallback notify failed (non-fatal)", notifyErr);
  }

  return NextResponse.json({ success: true });
}
