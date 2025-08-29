// API: POST mark as read / DELETE notification
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { getUserIdByEmail } from "@/lib/utils/admin";

export const runtime = "nodejs";

// POST /api/notifications/[id]/read?email=... - mark notification as read
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notificationId } = await params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const name = searchParams.get("name");

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

  // Use the new RPC function for marking notification as read
  const { data: success, error } = await supabaseAdmin.rpc("mark_notification_read", {
    p_notification_id: notificationId,
    p_email: email.toLowerCase(),
  });

  if (error) {
    console.error("Error marking notification as read:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!success) {
    return NextResponse.json({ error: "Notification not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/notifications/[id]?email=... - delete notification
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notificationId } = await params;
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const name = searchParams.get("name");

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

  const { error } = await supabaseAdmin.from("notifications").delete().eq("id", notificationId).eq("user_id", userId);

  if (error) {
    console.error("Error deleting notification:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
