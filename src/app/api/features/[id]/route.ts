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
