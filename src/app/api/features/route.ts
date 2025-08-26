// API: GET list (supports q, sort OR filter, pagination) / POST create
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/features?email=&q=&sort=trending|top|new&filter=all|open|planned|in_progress|done|mine&limit=10&page=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || "";
  const q = (searchParams.get("q") || "").trim();

  const sort = (searchParams.get("sort") || "") as "trending" | "top" | "new" | "";
  const filter = (searchParams.get("filter") || "all") as "all" | "open" | "under_review" | "planned" | "in_progress" | "done" | "mine";

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 50);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
  const from = (page - 1) * limit;

  // Use enhanced RPC function with database-level pagination and filtering
  try {
    const { data: rpcFeatures, error } = await supabaseAdmin.rpc("get_features_with_user_votes", {
      p_email: email.toLowerCase().trim(),
      p_search: q || null,
      p_sort: sort || "trending",
      p_filter: filter,
      p_limit: limit,
      p_offset: from,
    });

    if (error) {
      console.error("Error with enhanced features RPC function:", error);
      return NextResponse.json({ error: "Failed to load features" }, { status: 500 });
    }

    const results = rpcFeatures || [];

    // Extract total count from first result (all rows have same total_count)
    const total = results.length > 0 ? results[0].total_count : 0;

    // Remove total_count from each feature object and rename voted_by_me to votedByMe
    const items = results.map(({ total_count, voted_by_me, ...feature }: { total_count: number; voted_by_me: boolean; [key: string]: unknown }) => ({
      ...feature,
      votedByMe: voted_by_me,
    }));

    const hasMore = from + items.length < total;

    return NextResponse.json({ items, page, total, pageSize: limit, hasMore });
  } catch (error) {
    console.error("Error in features API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/features
// body: { title, description, email, name, image_url }
export async function POST(req: NextRequest) {
  let body: {
    title?: string;
    description?: string;
    email?: string;
    name?: string;
    image_url?: string;
  } = {};
  try {
    body = await req.json();
  } catch {}

  const { title, description, email, name, image_url } = body as {
    title?: string;
    description?: string;
    email?: string;
    name?: string;
    image_url?: string;
  };

  if (!email || !title || !description || !name) {
    console.log("email, name, title and description are required", email, name, title, description);
    return NextResponse.json({ error: "email, name, title and description are required" }, { status: 400 });
  }

  // Use the create_feature RPC function which handles user creation and feature creation
  const { data: feature, error } = await supabaseAdmin.rpc("create_feature", {
    p_email: email.toLowerCase(),
    p_name: name.trim().toLowerCase(),
    p_image_url: image_url || null,
    p_title: title.trim(),
    p_description: description.trim(),
  });

  if (error) {
    // Handle unique constraint violation
    if (error.code === "23505" || error.message?.includes("duplicate key value") || error.message?.includes("unique constraint")) {
      return NextResponse.json(
        {
          error: "You have already requested a feature with this title. Please use a different title or check your existing requests.",
        },
        { status: 409 }
      );
    }
    console.error("Error creating feature:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!feature) {
    return NextResponse.json({ error: "Failed to create feature" }, { status: 500 });
  }

  // The create_feature RPC already handles auto-upvoting by the creator, so no need to do it manually

  return NextResponse.json({ item: feature });
}
