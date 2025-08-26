// API: GET notifications (mobile app access with email/name in URL)
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { getUserIdByEmail } from "@/lib/utils/admin";

export const runtime = "nodejs";

// GET /api/notifications?email=...&name=...&limit=50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const name = searchParams.get("name");
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "50", 10), 1),
    100,
  );

  if (!email) {
    return NextResponse.json(
      { error: "email is required in URL parameters" },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "name is required in URL parameters" },
      { status: 400 },
    );
  }

  // Ensure user exists (create if needed) - similar to features system
  const { data: userId, error: userError } = await supabaseAdmin.rpc(
    "ensure_user",
    {
      p_email: email.toLowerCase(),
      p_name: name.trim().toLowerCase(),
      p_image_url: null,
    },
  );

  if (userError) {
    console.error("Error ensuring user exists:", userError);
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );
  }

  // Use the list_notifications RPC function which returns notifications with proper joins
  const { data: notifications, error } = await supabaseAdmin.rpc(
    "list_notifications",
    {
      p_email: email.toLowerCase(),
      p_limit: limit,
      p_offset: 0,
    },
  );

  if (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: notifications || [] });
}
