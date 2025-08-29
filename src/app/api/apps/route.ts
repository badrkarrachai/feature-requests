// API: GET list of apps for admin selection
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { isRequesterAdmin } from "@/lib/utils/admin";

export const runtime = "nodejs";

// GET /api/apps
export async function GET(req: NextRequest) {
  // Verify admin authentication
  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { data: apps, error } = await supabaseAdmin.from("apps").select("*").order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching apps:", error);
      return NextResponse.json({ error: "Failed to load apps" }, { status: 500 });
    }

    return NextResponse.json({ apps: apps || [] });
  } catch (error) {
    console.error("Error in apps API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/apps
export async function POST(req: NextRequest) {
  // Verify admin authentication
  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, slug } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    // Check if slug already exists
    const { data: existingApp, error: checkError } = await supabaseAdmin.from("apps").select("id").eq("slug", slug).single();

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking existing app:", checkError);
      return NextResponse.json({ error: "Failed to validate app" }, { status: 500 });
    }

    if (existingApp) {
      return NextResponse.json({ error: "App with this slug already exists" }, { status: 409 });
    }

    // Create new app
    const { data: newApp, error: insertError } = await supabaseAdmin.from("apps").insert([{ name, slug }]).select().single();

    if (insertError) {
      console.error("Error creating app:", insertError);
      return NextResponse.json({ error: "Failed to create app" }, { status: 500 });
    }

    return NextResponse.json({ app: newApp }, { status: 201 });
  } catch (error) {
    console.error("Error in apps API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
