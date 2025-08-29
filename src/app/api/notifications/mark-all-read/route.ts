// API: POST mark all notifications as read
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export const runtime = "nodejs";

// POST /api/notifications/mark-all-read?email=...&name=...&app_slug=...
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const name = searchParams.get("name");
  const appSlug = searchParams.get("app_slug");

  if (!email) {
    return NextResponse.json({ error: "email is required in URL parameters" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "name is required in URL parameters" }, { status: 400 });
  }

  // Ensure user exists (create if needed)
  const { data: userId, error: userError } = await supabaseAdmin.rpc("ensure_user", {
    p_email: email.toLowerCase(),
    p_name: name.trim().toLowerCase(),
    p_image_url: null,
  });

  if (userError) {
    console.error("Error ensuring user exists:", userError);
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }

  // Use the mark_all_notifications_read RPC function
  const { data: updatedCount, error } = await supabaseAdmin.rpc("mark_all_notifications_read", {
    p_email: email.toLowerCase(),
    p_app_slug: appSlug,
  });

  if (error) {
    console.error("Error marking notifications as read:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated_count: updatedCount });
}
