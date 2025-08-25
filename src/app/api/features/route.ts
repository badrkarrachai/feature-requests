// API: GET list (supports q, sort OR filter, pagination) / POST create
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { getUserIdByEmail } from "@/lib/utils/admin";

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
  const to = from + limit - 1;

  // Use the features_public view for better performance and author info
  let builder = supabaseAdmin.from("features_public").select("*", { count: "exact" });

  if (q) {
    // Split query into words and create search conditions for each word
    const searchTerms = q.split(/\s+/).filter((term) => term.length > 0);
    if (searchTerms.length > 0) {
      const searchConditions = searchTerms
        .map((term) => {
          const searchTerm = `%${term}%`;
          return `title.ilike.${searchTerm},description.ilike.${searchTerm},author_name.ilike.${searchTerm}`;
        })
        .join(",");
      builder = builder.or(searchConditions);
    }
  }

  // filter first
  if (filter === "mine") {
    if (!email)
      return NextResponse.json({
        items: [],
        page,
        total: 0,
        pageSize: limit,
        hasMore: false,
      });
    const userId = await getUserIdByEmail(email);
    if (!userId)
      return NextResponse.json({
        items: [],
        page,
        total: 0,
        pageSize: limit,
        hasMore: false,
      });
    builder = builder.eq("user_id", userId);
  } else if (filter !== "all") {
    // Map "open" to "under_review" for backward compatibility with frontend
    const dbFilter = filter === "open" ? "under_review" : filter;
    builder = builder.eq("status", dbFilter);
  }

  // sort next
  if (sort === "new") {
    builder = builder.order("created_at", { ascending: false }).order("id", { ascending: false });
  } else if (sort === "top" || sort === "trending") {
    builder = builder.order("votes_count", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
  } else {
    // default (filter-only) recency
    builder = builder.order("created_at", { ascending: false }).order("id", { ascending: false });
  }

  const { data, error, count } = await builder.range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // mark voted only for returned page
  const votedMap: Record<string, boolean> = {};
  if (email && data && data.length) {
    const userId = await getUserIdByEmail(email);
    if (userId) {
      const ids = data.map((f: { id: string }) => f.id);
      const { data: votes } = await supabaseAdmin.from("votes").select("feature_id").eq("user_id", userId).in("feature_id", ids);
      (votes || []).forEach((v: { feature_id: string }) => {
        votedMap[v.feature_id] = true;
      });
    }
  }

  const items = (data || []).map((f: { id: string; [key: string]: unknown }) => ({
    ...f,
    votedByMe: !!votedMap[f.id],
  }));
  const total = count ?? 0;
  const hasMore = from + items.length < total;

  return NextResponse.json({ items, page, total, pageSize: limit, hasMore });
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
