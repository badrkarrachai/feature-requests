// API: GET list (supports q, sort OR filter, pagination) / POST create
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/features?email=&q=&sort=trending|top|new&filter=all|open|planned|in_progress|done|mine&limit=10&page=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || "";
  const q = (searchParams.get("q") || "").trim();

  const sort = (searchParams.get("sort") || "") as "trending" | "top" | "new" | "";
  const filter = (searchParams.get("filter") || "all") as "all" | "open" | "planned" | "in_progress" | "done" | "mine";

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 50);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // select with exact count for hasMore
  let builder = supabaseAdmin.from("features").select("*", { count: "exact" });

  if (q) builder = builder.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

  // filter first
  if (filter === "mine") {
    if (!email) return NextResponse.json({ items: [], page, total: 0, pageSize: limit, hasMore: false });
    builder = builder.eq("created_by", email);
  } else if (filter !== "all") {
    builder = builder.eq("status", filter);
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
    const ids = data.map((f: any) => f.id);
    const { data: votes } = await supabaseAdmin.from("votes").select("feature_id").eq("email", email).in("feature_id", ids);
    (votes || []).forEach((v: any) => (votedMap[v.feature_id] = true));
  }

  const items = (data || []).map((f: any) => ({ ...f, votedByMe: !!votedMap[f.id] }));
  const total = count ?? 0;
  const hasMore = from + items.length < total;

  return NextResponse.json({ items, page, total, pageSize: limit, hasMore });
}

// POST /api/features
// body: { title, description, email }
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const { title, description, email } = body as {
    title?: string;
    description?: string;
    email?: string;
  };

  if (!email || !title || !description) {
    return NextResponse.json({ error: "email, title and description are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("features").insert({ title, description, status: "open", created_by: email }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // auto-upvote creator; ignore duplicates
  await supabaseAdmin.from("votes").upsert({ feature_id: data.id, email }, { onConflict: "feature_id,email", ignoreDuplicates: true });

  return NextResponse.json({ item: data });
}
