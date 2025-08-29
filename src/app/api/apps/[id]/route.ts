// API: DELETE app by ID
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { isRequesterAdmin, getAdminUser } from "@/lib/utils/admin";

export const runtime = "nodejs";

// DELETE /api/apps/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Verify admin authentication
  if (!(await isRequesterAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const appId = (await params).id;

    if (!appId) {
      return NextResponse.json({ error: "App ID is required" }, { status: 400 });
    }

    // Get authenticated admin user
    const adminUser = await getAdminUser();
    if (!adminUser) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    // Get app details to find the slug for the RPC
    const { data: existingApp, error: fetchError } = await supabaseAdmin.from("apps").select("slug").eq("id", appId).single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ error: "App not found" }, { status: 404 });
      }
      console.error("Error fetching app:", fetchError);
      return NextResponse.json({ error: "Failed to fetch app" }, { status: 500 });
    }

    // Parse query parameters for deletion options
    const url = new URL(req.url);
    const deleteSharedUsers = url.searchParams.get("deleteSharedUsers") === "true";

    // Use the new admin_delete_app RPC function
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("admin_delete_app", {
      p_admin_id: adminUser.id,
      p_app_slug: existingApp.slug,
      p_delete_shared_users: deleteSharedUsers,
    });

    if (rpcError) {
      console.error("Error deleting app via RPC:", rpcError);
      return NextResponse.json(
        {
          error: rpcError.message || "Failed to delete app",
          details: rpcError.details,
        },
        { status: 500 }
      );
    }

    if (!rpcResult) {
      return NextResponse.json({ error: "App deletion failed" }, { status: 500 });
    }

    return NextResponse.json({
      message: "App deleted successfully",
      deletedSharedUsers: deleteSharedUsers,
    });
  } catch (error) {
    console.error("Error in apps API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
