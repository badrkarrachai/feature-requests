import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { isRequesterAdmin } from "@/lib/utils/admin";

const ALLOWED = ["under_review", "planned", "in_progress", "done"] as const;
type FeatureStatus = (typeof ALLOWED)[number];

function toSlug(input: string): FeatureStatus | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "_");
  return (ALLOWED as readonly string[]).includes(s) ? (s as FeatureStatus) : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    admin_email?: string;
    admin_password?: string;
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
  if (!body.admin_email || !body.admin_password) {
    return NextResponse.json({ error: "admin_email and admin_password required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("admin_update_feature_status", {
    p_admin_email: body.admin_email.toLowerCase(),
    p_password: body.admin_password,
    p_feature_id: id,
    p_new_status: status, // text slug now
  });

  if (error) {
    console.error("Error updating feature status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Feature not found" }, { status: 404 });

  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Check if requester is admin
  const isAdmin = await isRequesterAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: { admin_email?: string; admin_password?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const { admin_email, admin_password } = body as {
    admin_email?: string;
    admin_password?: string;
  };

  if (!admin_email || !admin_password) {
    return NextResponse.json({ error: "admin_email and admin_password required" }, { status: 400 });
  }

  // Use the admin_delete_feature RPC function
  const { data: success, error } = await supabaseAdmin.rpc("admin_delete_feature", {
    p_admin_email: admin_email.toLowerCase(),
    p_password: admin_password,
    p_feature_id: id,
  });

  if (error) {
    console.error("Error deleting feature:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!success) {
    return NextResponse.json({ error: "Feature not found or invalid admin credentials" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
